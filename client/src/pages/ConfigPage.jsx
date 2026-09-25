import PageTitle from '../components/ui/PageTitle.jsx'
import PicklistManager from '../components/settings/PicklistManager.jsx'
import ProductManager from '../components/settings/ProductManager.jsx'
import PrioritySlaManager from '../components/settings/PrioritySlaManager.jsx'
import ClassificationManager from '../components/settings/ClassificationManager.jsx'
import EscalationManager from '../components/settings/EscalationManager.jsx'
import { PICKLIST_FIELDS } from '../utils/picklistMeta.js'

function GroupHeading({ children }) {
  return <h2 className="text-[12px] font-bold uppercase tracking-wider text-muted">{children}</h2>
}

export default function ConfigPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageTitle title="Config" subtitle="Admin-managed rules and option lists that shape how tickets behave." />

      <div className="flex flex-col gap-3">
        <GroupHeading>SLA &amp; Priority</GroupHeading>
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
          <PrioritySlaManager />
          <ClassificationManager />
        </div>
        <EscalationManager />
      </div>

      <div className="flex flex-col gap-3">
        <GroupHeading>Ticket Field Values</GroupHeading>
        <p className="-mt-1 text-[13px] text-muted">Manage the option lists agents choose from on a ticket's properties.</p>

        <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
          <ProductManager />
          {PICKLIST_FIELDS.map((field) => (
            <PicklistManager key={field.value} field={field.value} label={field.label} />
          ))}
        </div>
      </div>
    </div>
  )
}
