import PageTitle from '../components/ui/PageTitle.jsx'
import PicklistManager from '../components/settings/PicklistManager.jsx'
import ProductManager from '../components/settings/ProductManager.jsx'
import PrioritySlaManager from '../components/settings/PrioritySlaManager.jsx'
import ClassificationManager from '../components/settings/ClassificationManager.jsx'
import EscalationManager from '../components/settings/EscalationManager.jsx'

function GroupHeading({ children }) {
  return <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted">{children}</h2>
}

/** Every card is one full-width row, grouped under a heading. */
export default function ConfigPage() {
  return (
    <div className="flex w-full flex-col gap-6">
      <PageTitle title="Config" subtitle="Admin-managed rules and option lists that shape how tickets behave." />

      <section className="flex flex-col gap-4">
        <GroupHeading>SLA &amp; Escalation</GroupHeading>
        <PrioritySlaManager />
        <EscalationManager />
      </section>

      <section className="flex flex-col gap-4">
        <GroupHeading>Ticket Field Values</GroupHeading>
        <PicklistManager field="STATUS" label="Status" />
        <ClassificationManager />
        <ProductManager />
        <PicklistManager field="TEAM_TYPE" label="Team Type" />
      </section>
    </div>
  )
}
