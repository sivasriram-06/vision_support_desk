const teamRepository = require("../repositories/team.repository");
const organizationService = require("./organization.service");
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

module.exports = { listTeams, getTeamById };
