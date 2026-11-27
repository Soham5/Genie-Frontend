import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApiState } from '@/api/ApiProvider'
import { Callout, PageHead } from '@/components/ui/Panel'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import StoredBacktests from './Backtests'
import StrategyBacktest from './StrategyBacktest'

type Tab = 'run' | 'stored'

export default function BacktestLab() {
  const api = useApiState()
  const id = useId()
  const [tab, setTab] = useState<Tab>('run')
  // Tabs stay mounted once opened so a form, a result or a run in flight survives switching; the stored runs load on first visit.
  const [storedOpened, setStoredOpened] = useState(false)
  const [running, setRunning] = useState(false)

  const select = (next: Tab) => {
    setTab(next)
    if (next === 'stored') setStoredOpened(true)
  }

  const head = <PageHead title="Backtest Lab" sub="Replay strategies over history with realistic costs, or review the runs stored by the Genie API." />

  if (api.status === 'unconfigured') {
    return (
      <>
        {head}
        <Callout tone="info" title="Not connected.">
          Set the API URL and key in <Link className="link-btn" to="/settings">Settings</Link> to run backtests and load stored results.
        </Callout>
      </>
    )
  }

  return (
    <>
      {head}
      <Tabs
        id={id}
        label="Backtest Lab sections"
        value={tab}
        onChange={select}
        tabs={[
          { value: 'run', label: 'Strategy Backtest', busy: running },
          { value: 'stored', label: 'Stored Results' },
        ]}
      />
      <TabPanel id={id} value="run" active={tab === 'run'}>
        <StrategyBacktest onRunningChange={setRunning} />
      </TabPanel>
      {storedOpened && (
        <TabPanel id={id} value="stored" active={tab === 'stored'}>
          <StoredBacktests />
        </TabPanel>
      )}
    </>
  )
}
