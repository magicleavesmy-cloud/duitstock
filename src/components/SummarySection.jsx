import { ArrowDownIcon, ArrowUpIcon, CalendarIcon } from '../icons'
import { DashboardBox, DashboardStatRow } from './DashboardCard'

export default function SummarySection({ formatRM, summary }) {
  return (
    <div className="dashboard-summary-grid grid gap-2.5">
      <DashboardBox
        accent="teal"
        icon={CalendarIcon}
        iconClassName="bg-emerald-50 text-emerald-700 ring-emerald-100"
        title="Last 10 Days Summary"
      >
        <DashboardStatRow
          icon={ArrowUpIcon}
          iconClassName="bg-emerald-50 text-emerald-700"
          label="Total In Stock Value"
          sublabel="Last 10 Days"
          value={formatRM(summary.last10Days.inValue)}
          valueClassName="text-emerald-700"
        />
        <DashboardStatRow
          icon={ArrowDownIcon}
          iconClassName="bg-red-50 text-red-600"
          label="Total Stock Out Value"
          sublabel="Last 10 Days"
          value={formatRM(summary.last10Days.outValue)}
          valueClassName="text-red-600"
        />
      </DashboardBox>

      <DashboardBox
        accent="blue"
        icon={CalendarIcon}
        iconClassName="bg-blue-50 text-blue-600 ring-blue-100"
        title="This Month Summary"
      >
        <DashboardStatRow
          icon={ArrowUpIcon}
          iconClassName="bg-emerald-50 text-emerald-700"
          label="Total In Stock Value"
          sublabel="This Month"
          value={formatRM(summary.thisMonth.inValue)}
          valueClassName="text-emerald-700"
        />
        <DashboardStatRow
          icon={ArrowDownIcon}
          iconClassName="bg-red-50 text-red-600"
          label="Total Stock Out Value"
          sublabel="This Month"
          value={formatRM(summary.thisMonth.outValue)}
          valueClassName="text-red-600"
        />
      </DashboardBox>
    </div>
  )
}
