const express = require("express");
const teamController = require("../../controllers/team.controller");
const validate = require("../../middleware/validate.middleware");
const { teamIdParamSchema, createTeamSchema, updateTeamSchema } = require("../../schemas/team.schema");

const router = express.Router();

router.get("/", teamController.listTeams);
router.post("/", validate(createTeamSchema), teamController.createTeam);
router.get("/:teamId", validate(teamIdParamSchema, "params"), teamController.getTeamById);
router.patch("/:teamId", validate(teamIdParamSchema, "params"), validate(updateTeamSchema), teamController.updateTeam);
router.delete("/:teamId", validate(teamIdParamSchema, "params"), teamController.deleteTeam);

module.exports = router;
