import { useParams } from 'react-router'
import { RecordingsView } from './RecordingsView'

/** /recordings/:itemId (`Destination.Recordings`). */
export default function RecordingsPage() {
  const { itemId } = useParams()
  return <RecordingsView key={itemId} folderId={itemId ?? ''} />
}
