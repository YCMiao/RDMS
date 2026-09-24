import type { LucideIcon } from "lucide-react"

type EmptyPanelProps = {
  icon: LucideIcon
  title: string
  description: string
}

export function EmptyPanel({ icon: Icon, title, description }: EmptyPanelProps) {
  return <div className="ui-empty"><span className="ui-empty-icon" aria-hidden="true"><Icon size={19} strokeWidth={1.7} /></span><div><strong>{title}</strong><p>{description}</p></div></div>
}
