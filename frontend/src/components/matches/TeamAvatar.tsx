interface TeamAvatarProps {
  name?: string
  logo?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASSES: Record<NonNullable<TeamAvatarProps['size']>, string> = {
  sm: 'w-5 h-5 text-[10px]',
  md: 'w-7 h-7 text-xs',
  lg: 'w-12 h-12 text-sm',
}

function getInitials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export function TeamAvatar({ name, logo, size = 'md', className = '' }: TeamAvatarProps) {
  const sizeClass = SIZE_CLASSES[size]
  const fallbackClasses = `${sizeClass} inline-flex items-center justify-center rounded-full bg-gray-700 text-gray-300 ring-1 ring-gray-600 font-semibold ${className}`.trim()

  if (logo) {
    return (
      <span className="relative inline-flex">
        <img
          src={logo}
          alt={name ? `${name} logo` : 'Team logo'}
          className={`${sizeClass} rounded-full object-contain bg-white/90 p-0.5 ring-1 ring-gray-600 ${className}`.trim()}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
            const next = e.currentTarget.nextElementSibling as HTMLSpanElement | null
            if (next) next.style.display = 'inline-flex'
          }}
        />
        <span
          className={fallbackClasses}
          style={{ display: 'none' }}
          aria-label={name ? `${name} initials` : 'Team initials'}
          title={name ?? 'Unknown team'}
        >
          {getInitials(name)}
        </span>
      </span>
    )
  }

  return (
    <span
      className={fallbackClasses}
      aria-label={name ? `${name} initials` : 'Team initials'}
      title={name ?? 'Unknown team'}
    >
      {getInitials(name)}
    </span>
  )
}
