import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Inspection from './pages/Inspection'
import CameraConfig from './pages/CameraConfig'
import IndicatorConfig from './pages/IndicatorConfig'
import Dataset from './pages/Dataset'
import DatasetGallery from './pages/DatasetGallery'
import OutputGallery from './pages/OutputGallery'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/inspection" replace />} />
        <Route path="inspection" element={<Inspection />} />
        <Route path="camera-config" element={<CameraConfig />} />
        <Route path="indicator-config" element={<IndicatorConfig />} />
        <Route path="dataset-preparation" element={<Dataset />} />
        <Route path="dataset-gallery" element={<DatasetGallery />} />
        <Route path="output-gallery" element={<OutputGallery />} />
      </Route>
    </Routes>
  )
}
