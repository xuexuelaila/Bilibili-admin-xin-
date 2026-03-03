import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import TasksPage from './pages/TasksPage'
import TaskFormPage from './pages/TaskFormPage'
import RunsPage from './pages/RunsPage'
import RunDetailPage from './pages/RunDetailPage'
import VideosPage from './pages/VideosPage'
import ProductsPage from './pages/ProductsPage'
import CoversPage from './pages/CoversPage'
import SystemPage from './pages/SystemPage'
import CreatorCenterPage from './pages/CreatorCenterPage'

export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path='/' element={<Navigate to='/tasks' replace />} />
        <Route path='/dashboard' element={<Navigate to='/tasks' replace />} />
        <Route path='/tasks' element={<TasksPage />} />
        <Route path='/tasks/new' element={<TaskFormPage mode='create' />} />
        <Route path='/tasks/:id/edit' element={<TaskFormPage mode='edit' />} />
        <Route path='/tasks/:id/runs' element={<RunsPage />} />
        <Route path='/runs/:runId' element={<RunDetailPage />} />
        <Route path='/videos' element={<VideosPage />} />
        <Route path='/products' element={<ProductsPage />} />
        <Route path='/covers' element={<CoversPage />} />
        <Route path='/creator-center' element={<CreatorCenterPage />} />
        <Route path='/creator-updates' element={<Navigate to='/creator-center' replace />} />
        <Route path='/creators' element={<Navigate to='/creator-center' replace />} />
        <Route path='/settings' element={<SystemPage />} />
        <Route path='/alerts' element={<Navigate to='/settings' replace />} />
        <Route path='/templates' element={<Navigate to='/settings' replace />} />
      </Routes>
    </AppLayout>
  )
}
