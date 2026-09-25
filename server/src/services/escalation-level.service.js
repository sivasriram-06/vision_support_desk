const escalationLevelRepository = require("../repositories/escalation-level.repository");
const prioritySlaRepository = require("../repositories/priority-sla.repository");
const organizationService = require("./organization.service");
const { rebuildTriggersForPriority } = require("./sla/escalation.service");
const { getDB } = require("../config/db");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

/**
 * Escalation matrix on the Config page: per priority, any number of
 * levels, each reached Offset_Hours from the SLA due date. Every change
 * re-derives the trigger times of that priority's open tickets, so the
 * Escalations queue reflects the new matrix at once.
 */

const listLevels = () => {
    const org = organizationService.getDefaultOrganization();
    return escalationLevelRepository.findAll(org.Organization_Id);
};

const getLevelById = (escalationLevelId) => {
    const level = escalationLevelRepository.findById(escalationLevelId);
    if (!level) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.ESCALATION_LEVEL_NOT_FOUND, "Escalation level not found");
    }
    return level;
};

/**
 * A higher level must be reached later than a lower one: offsets strictly
 * increase with Level_No within the priority. `candidate` is the level
 * being added or edited.
 */
const assertOrdered = (orgId, priority, candidate) => {
    const levels = escalationLevelRepository.findByPriority(orgId, priority)
        .filter((level) => level.Level_No !== candidate.Level_No)
        .concat(candidate)
        .sort((a, b) => a.Level_No - b.Level_No);
    for (let i = 1; i < levels.length; i += 1) {
        if (levels[i].Offset_Hours <= levels[i - 1].Offset_Hours) {
            throw new ApiError(
                HTTP_STATUS.BAD_REQUEST,
                ERROR_CODES.ESCALATION_LEVEL_ORDER,
                `Level ${levels[i].Level_No} must trigger later than level ${levels[i - 1].Level_No}`
            );
        }
    }
};

const createLevel = ({ priority, levelNo, offsetHours }, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const orgId = org.Organization_Id;
    const priorityKey = priority.trim();

    if (!prioritySlaRepository.findByPriority(orgId, priorityKey)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, ERROR_CODES.PRIORITY_NOT_FOUND, "Priority not found");
    }
    if (escalationLevelRepository.findByPriorityAndLevel(orgId, priorityKey, levelNo)) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.ESCALATION_LEVEL_DUPLICATE, `Level ${levelNo} already exists for ${priorityKey}`);
    }
    assertOrdered(orgId, priorityKey, { Level_No: levelNo, Offset_Hours: offsetHours });

    const id = generateId();
    getDB().transaction(() => {
        escalationLevelRepository.insert({
            Escalation_Level_Id: id,
            Priority: priorityKey,
            Level_No: levelNo,
            Offset_Hours: offsetHours,
            Created_By: actorAgentId,
            Org_Id: orgId
        });
        rebuildTriggersForPriority(orgId, priorityKey);
    })();
    return getLevelById(id);
};

const updateLevel = (escalationLevelId, { offsetHours }, actorAgentId) => {
    const level = getLevelById(escalationLevelId);
    assertOrdered(level.Org_Id, level.Priority, { Level_No: level.Level_No, Offset_Hours: offsetHours });

    getDB().transaction(() => {
        escalationLevelRepository.updateById(escalationLevelId, { Offset_Hours: offsetHours, Modified_By: actorAgentId });
        rebuildTriggersForPriority(level.Org_Id, level.Priority);
    })();
    return getLevelById(escalationLevelId);
};

const deleteLevel = (escalationLevelId, actorAgentId) => {
    const level = getLevelById(escalationLevelId);
    getDB().transaction(() => {
        escalationLevelRepository.softDeleteById(escalationLevelId, actorAgentId);
        rebuildTriggersForPriority(level.Org_Id, level.Priority);
    })();
};

module.exports = { listLevels, createLevel, updateLevel, deleteLevel };
