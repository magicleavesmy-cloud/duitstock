import { ArrowDownIcon, ArrowUpIcon, CalendarIcon } from '../icons'
import { DashboardBox, DashboardStatRow } from './DashboardCard'

export default function SummarySection({ formatRM, summary }) {
  return (
    <div className="dashboard-summary-grid grid gap-2.5">
      <DashboardBox
        accent="teal"
        icon={CalendarIcon}
        iconClassName="text-emerald-700"
        title="Last 10 Days Summary"
      >
        <DashboardStatRow
          icon={ArrowUpIcon}
          iconClassName="text-emerald-700"
          label="Total In Stock Value"
          sublabel="Last 10 Days"
          value={formatRM(summary.last10Days.inValue)}
          valueClassName="text-emerald-700"
        />
        <DashboardStatRow
          icon={ArrowDownIcon}
          iconClassName="text-red-600"
          label="Total Stock Out Value"
          sublabel="Last 10 Days"
          value={formatRM(summary.last10Days.outValue)}
          valueClassName="text-red-600"
        />
      </DashboardBox>

      <DashboardBox
        accent="gold"
        icon={CalendarIcon}
        iconClassName="text-amber-600"
        title="This Month Summary"
      >
        <DashboardStatRow
          icon={ArrowUpIcon}
          iconClassName="text-emerald-700"
          label="Total In Stock Value"
          sublabel="This Month"
          value={formatRM(summary.thisMonth.inValue)}
          valueClassName="text-emerald-700"
        />
        <DashboardStatRow
          icon={ArrowDownIcon}
          iconClassName="text-red-600"
          label="Total Stock Out Value"
          sublabel="This Month"
          value={formatRM(summary.thisMonth.outValue)}
          valueClassName="text-red-600"
        />
      </DashboardBox>
    </div>
  )
}
