import { Search } from 'lucide-react'
import { Input } from './ui/input'

type SearchFieldProps = { label: string; value: string; onChange: (value: string) => void }

export function SearchField({ label, value, onChange }: SearchFieldProps) {
  return (
    <div className="search-box">
      <Search aria-hidden="true" className="search-icon" />
      <Input aria-label={label} className="pl-10" placeholder="Caută" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
