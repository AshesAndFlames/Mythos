/** /home is the landing page's "open app" target; Mythos's home is the universe list. */

import { Navigate } from 'react-router-dom'

export default function HomePage() {
  return <Navigate to="/universes" replace />
}
