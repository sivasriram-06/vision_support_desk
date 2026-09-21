const teamService = require("../services/team.service");
const HTTP_STATUS = require("../constants/http-status");
const { ok } = require("../utils/api-response");

const listTeams = (req, res, next) => {
    try {
        const teams = teamService.listTeams(req.query);
        ok(res, HTTP_STATUS.OK, teams);
    } catch (error) {
        next(error);
    }
};

const getTeamById = (req, res, next) => {
    try {
        const team = teamService.getTeamById(req.params.teamId);
        ok(res, HTTP_STATUS.OK, team);
    } catch (error) {
        next(error);
    }
};

module.exports = { listTeams, getTeamById };
