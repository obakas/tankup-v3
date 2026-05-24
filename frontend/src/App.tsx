import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminOverviewPage from './features/admin/AdminOverviewPage'
import ClientPortal from './features/client/ClientPortal'
import DriverPortal from './features/driver/DriverPortal'
import FleetOwnerDashboard from './features/fleet/FleetOwnerDashboard'
import OperationsDashboard from './features/operations/OperationsDashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminOverviewPage />} path="/" />
        <Route element={<DriverPortal />} path="/driver/*" />
        <Route element={<FleetOwnerDashboard />} path="/fleet" />
        <Route element={<OperationsDashboard />} path="/operations" />
        <Route element={<ClientPortal />} path="/client/*" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </BrowserRouter>
  )
}

export default App
