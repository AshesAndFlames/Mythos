/** Small labels: article type, category, status, role, tag. */

import { Link } from 'react-router-dom'
import {
  BookMarked,
  Castle,
  Crown,
  Gem,
  Landmark,
  MapPin,
  PawPrint,
  ScrollText,
  Sparkles,
  Swords,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { ARTICLE_TYPE_LABELS, type ArticleStatus, type ArticleType, type UniverseRole } from '@/domain/mythos'
import { cn } from '@/lib/utils'

export const TYPE_ICONS: Record<ArticleType, LucideIcon> = {
  character: UserRound,
  location: MapPin,
  faction: Castle,
  event: Swords,
  species: PawPrint,
  item: Gem,
  lore: ScrollText,
  culture: Landmark,
  other: Sparkles,
}

const pill = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4'

export function TypeBadge({ type, className }: { type: ArticleType; className?: string }) {
  const Icon = TYPE_ICONS[type]
  return (
    <span className={cn(pill, 'border-primary/30 bg-primary/10 text-primary', className)}>
      <Icon className="size-3" aria-hidden />
      {ARTICLE_TYPE_LABELS[type]}
    </span>
  )
}

export function CategoryBadge({
  name,
  href,
  className,
}: {
  name: string
  href?: string
  className?: string
}) {
  const cls = cn(pill, 'border-border bg-secondary text-secondary-foreground', className)
  const body = (
    <>
      <BookMarked className="size-3 opacity-70" aria-hidden />
      {name}
    </>
  )
  return href ? (
    <Link to={href} className={cn(cls, 'hover:border-primary/40')}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  )
}

export function StatusBadge({ status, className }: { status: ArticleStatus; className?: string }) {
  return status === 'published' ? (
    <span className={cn(pill, 'border-success/40 bg-success/10 text-success', className)}>Published</span>
  ) : (
    <span className={cn(pill, 'border-border bg-muted text-muted-foreground', className)}>Draft</span>
  )
}

export function RoleBadge({ role, className }: { role: UniverseRole; className?: string }) {
  return (
    <span className={cn(pill, 'border-border bg-muted capitalize text-muted-foreground', className)}>
      {role === 'owner' && <Crown className="size-3 text-primary" aria-hidden />}
      {role}
    </span>
  )
}

export function TagChip({ name, className }: { name: string; className?: string }) {
  return <span className={cn('text-xs text-muted-foreground', className)}>#{name}</span>
}
