import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import TasksPage from './pages/TasksPage'
import TaskFormPage from './pages/TaskFormPage'
import RunsPage from './pages/RunsPage'
import VideosPage from './pages/VideosPage'
import VideoDetailPage from './pages/VideoDetailPage'
import SettingsPage from './pages/SettingsPage'
import AlertsPage from './pages/AlertsPage'
import DashboardPage from './pages/DashboardPage'
import TemplatesPage from './pages/TemplatesPage'

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path='/' element={<Navigate to='/dashboard' replace />} />
        <Route path='/dashboard' element={<DashboardPage />} />
        <Route path='/tasks' element={<TasksPage />} />
        <Route path='/tasks/new' element={<TaskFormPage mode='create' />} />
        <Route path='/tasks/:id/edit' element={<TaskFormPage mode='edit' />} />
        <Route path='/tasks/:id/runs' element={<RunsPage />} />
        <Route path='/videos' element={<VideosPage />} />
        <Route path='/videos/:bvid' element={<VideoDetailPage />} />
        <Route path='/settings' element={<SettingsPage />} />
        <Route path='/alerts' element={<AlertsPage />} />
        <Route path='/templates' element={<TemplatesPage />} />
      </Routes>
    </AppLayout>
  )
}
