import { Dashboard } from '../extension/dashboard/Dashboard'
import { mount } from './mount'

void mount(() => (
  <div className="flex min-h-dvh flex-col">
    <Dashboard />
  </div>
))
