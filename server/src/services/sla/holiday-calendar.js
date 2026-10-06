const holidayRepository = require("../../repositories/holiday.repository");
const appSettingRepository = require("../../repositories/app-setting.repository");
const organizationService = require("../organization.service");
const { setHolidayProvider } = require("./business-calendar");

// Company holidays for every calendar, cached as getCalendar() runs per ticket; invalidate() on change.
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
