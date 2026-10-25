import { Route, Routes } from 'react-router-dom'
import { Protege } from './composants/commun.tsx'
import Association from './pages/Association.tsx'
import Documents from './pages/Documents.tsx'
import Editeur from './pages/Editeur.tsx'
import Entree from './pages/Entree.tsx'
import Telechargement from './pages/Telechargement.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Entree />} />
      <Route path="/invitation/:jeton" element={<Entree />} />
      <Route path="/documents" element={<Protege><Documents /></Protege>} />
      <Route path="/documents/:docId" element={<Protege><Editeur /></Protege>} />
      <Route path="/l/:lienId" element={<Telechargement />} />
      <Route path="/association" element={<Association />} />
      <Route path="*" element={<Entree />} />
    </Routes>
  )
}
