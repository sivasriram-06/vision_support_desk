const holidayRepository = require("../../repositories/holiday.repository");
const appSettingRepository = require("../../repositories/app-setting.repository");
const organizationService = require("../organization.service");
const { setHolidayProvider } = require("./business-calendar");

/**
 * Feeds company holidays into every calendar (business-calendar.js) from
 * HD_HOLIDAY + the 24x7 setting, cached in memory - getCalendar() runs for
 * every ticket, so the database is read once and again only after a
 * holiday or the setting changes (invalidate()). Loaded by the SLA and
 * resolution-clock services, so it's active wherever SLAs are computed.
 */
const SETTING_APPLY_TO_24X7 = "holidays.apply_to_24x7";

let cache = null;

const load = () => {
    const org = organizationService.getDefaultOrganization();
    return {
        dates: new Set(holidayRepository.findAll(org.Organization_Id).map((h) => h.Holiday_Date)),
        applyTo24x7: appSettingRepository.get(org.Organization_Id, SETTING_APPLY_TO_24X7) === "Y"
    };
};

const getCompanyHolidays = () => {
    if (!cache) cache = load();
    return cache;
};

/** Call after any holiday / setting change. */
const invalidate = () => {
    cache = null;
};

setHolidayProvider(getCompanyHolidays);

module.exports = { SETTING_APPLY_TO_24X7, getCompanyHolidays, invalidate };
