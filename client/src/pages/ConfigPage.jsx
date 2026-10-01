import PageTitle from '../components/ui/PageTitle.jsx'
import PicklistManager from '../components/settings/PicklistManager.jsx'
import ProductManager from '../components/settings/ProductManager.jsx'
import PrioritySlaManager from '../components/settings/PrioritySlaManager.jsx'
import ClassificationManager from '../components/settings/ClassificationManager.jsx'
import EscalationManager from '../components/settings/EscalationManager.jsx'
import HolidayManager from '../components/settings/HolidayManager.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { PERMISSIONS } from '../auth/permissions.js'

function GroupHeading({ children }) {
  return <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted">{children}</h2>
}

/**
 * Every card is one full-width row, grouped under a heading. Team Leads
 * reach this page for the Holiday Calendar only (holidays.manage); the
 * rest needs config.manage.
 */
export default function ConfigPage() {
  const { can } = useAuth()
  const canConfig = can(PERMISSIONS.CONFIG_MANAGE)
  const canHolidays = can(PERMISSIONS.HOLIDAYS_MANAGE)

  return (
    <div className="flex w-full flex-col gap-6">
      <PageTitle title="Config" subtitle="Admin-managed rules and option lists that shape how tickets behave." />

      <section className="flex flex-col gap-4">
        <GroupHeading>SLA &amp; Escalation</GroupHeading>
        {canConfig && <PrioritySlaManager />}
        {canConfig && <EscalationManager />}
        {canHolidays && <HolidayManager />}
      </section>

      {canConfig && (
        <section className="flex flex-col gap-4">
          <GroupHeading>Ticket Field Values</GroupHeading>
          <PicklistManager field="STATUS" label="Status" />
          <ClassificationManager />
          <ProductManager />
          <PicklistManager field="TEAM_TYPE" label="Team Type" />
        </section>
      )}
    </div>
  )
}
