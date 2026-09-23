const teamRepository = require("../repositories/team.repository");
const departmentService = require("./department.service");
const organizationService = require("./organization.service");
const generateId = require("../utils/generate-id");
const ApiError = require("../utils/api-error");
const ERROR_CODES = require("../constants/error-codes");
const HTTP_STATUS = require("../constants/http-status");

const listTeams = (query) => {
    const org = organizationService.getDefaultOrganization();
    return teamRepository.findAll(org.Organization_Id, query);
};

const getTeamById = (teamId) => {
    const team = teamRepository.findById(teamId);
    if (!team) {
        throw new ApiError(HTTP_STATUS.NOT_FOUND, ERROR_CODES.TEAM_NOT_FOUND, "Team not found");
    }
    return team;
};

const createTeam = (payload, actorAgentId) => {
    const org = organizationService.getDefaultOrganization();
    const department = departmentService.getDepartmentById(payload.departmentId);
    const teamName = payload.teamName.trim();

    const existing = teamRepository.findByName(org.Organization_Id, department.Department_Id, teamName);
    if (existing) {
        throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.TEAM_DUPLICATE, "A team with this name already exists in this department");
    }

    const teamId = generateId();
    teamRepository.insert({
        Team_Id: teamId,
        Team_Name: teamName,
        Department_Id: department.Department_Id,
        Created_By: actorAgentId,
        Org_Id: org.Organization_Id
    });
    return teamRepository.findById(teamId);
};

const updateTeam = (teamId, payload, actorAgentId) => {
    const existing = getTeamById(teamId);
    const org = organizationService.getDefaultOrganization();

    const changes = { Modified_By: actorAgentId };
    const departmentId = payload.departmentId !== undefined ? payload.departmentId : existing.Department_Id;
    if (payload.departmentId !== undefined) {
        departmentService.getDepartmentById(payload.departmentId);
        changes.Department_Id = payload.departmentId;
    }
    if (payload.teamName !== undefined) {
        const teamName = payload.teamName.trim();
        const duplicate = teamRepository.findByName(org.Organization_Id, departmentId, teamName);
        if (duplicate && duplicate.Team_Id !== teamId) {
            throw new ApiError(HTTP_STATUS.CONFLICT, ERROR_CODES.TEAM_DUPLICATE, "A team with this name already exists in this department");
        }
        changes.Team_Name = teamName;
    }

    teamRepository.updateById(teamId, changes);
    return teamRepository.findById(teamId);
};

const deleteTeam = (teamId, actorAgentId) => {
    getTeamById(teamId);
    teamRepository.softDeleteById(teamId, actorAgentId);
};

module.exports = { listTeams, getTeamById, createTeam, updateTeam, deleteTeam };
