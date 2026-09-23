const teamService = require("../services/team.service");
const getActorAgentId = require("../utils/get-actor");
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

const createTeam = (req, res, next) => {
    try {
        const team = teamService.createTeam(req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.CREATED, team);
    } catch (error) {
        next(error);
    }
};

const updateTeam = (req, res, next) => {
    try {
        const team = teamService.updateTeam(req.params.teamId, req.body, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, team);
    } catch (error) {
        next(error);
    }
};

const deleteTeam = (req, res, next) => {
    try {
        teamService.deleteTeam(req.params.teamId, getActorAgentId(req));
        ok(res, HTTP_STATUS.OK, { deleted: true });
    } catch (error) {
        next(error);
    }
};

module.exports = { listTeams, getTeamById, createTeam, updateTeam, deleteTeam };
