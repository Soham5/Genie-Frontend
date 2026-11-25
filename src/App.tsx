import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ApiProvider } from '@/api/ApiProvider'
import { TradesProvider } from '@/api/TradesProvider'
import { Shell } from '@/components/layout/Shell'
import { Skeleton } from '@/components/ui/Panel'
import { LiveBookProvider } from '@/hooks/useLiveBook'

const Overview = lazy(() => import('@/pages/Overview'))
const Trading = lazy(() => import('@/pages/Trading'))
const Positions = lazy(() => import('@/pages/Positions'))
const Orders = lazy(() => import('@/pages/Orders'))
const Strategies = lazy(() => import('@/pages/Strategies'))
const Market = lazy(() => import('@/pages/Market'))
const Risk = lazy(() => import('@/pages/Risk'))
const System = lazy(() => import('@/pages/System'))
const Backtests = lazy(() => import('@/pages/Backtests'))
const Settings = lazy(() => import('@/pages/Settings'))

export function App() {
  return (
    <ApiProvider>
      <TradesProvider>
        <LiveBookProvider>
          <Suspense fallback={<div className="page"><Skeleton height={320} /></div>}>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<Overview />} />
                <Route path="trading" element={<Trading />} />
                <Route path="positions" element={<Positions />} />
                <Route path="orders" element={<Orders />} />
                <Route path="strategies" element={<Strategies />} />
                <Route path="market" element={<Market />} />
                <Route path="risk" element={<Risk />} />
                <Route path="system" element={<System />} />
                <Route path="backtests" element={<Backtests />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </LiveBookProvider>
      </TradesProvider>
    </ApiProvider>
  )
}
