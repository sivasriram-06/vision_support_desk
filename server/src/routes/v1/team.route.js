const express = require("express");
const teamController = require("../../controllers/team.controller");

const router = express.Router();

router.get("/", teamController.listTeams);
router.get("/:teamId", teamController.getTeamById);

module.exports = router;
