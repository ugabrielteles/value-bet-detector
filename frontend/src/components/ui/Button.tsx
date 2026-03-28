import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  isLoading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={clsx(
        'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-blue-600 hover:bg-blue-500 text-white focus:ring-blue-500': variant === 'primary',
          'bg-gray-700 hover:bg-gray-600 text-gray-100 focus:ring-gray-500': variant === 'secondary',
          'bg-red-700 hover:bg-red-600 text-white focus:ring-red-500': variant === 'danger',
          'bg-transparent hover:bg-gray-700 text-gray-300 hover:text-white focus:ring-gray-500': variant === 'ghost',
          'px-2.5 py-1.5 text-xs gap-1.5': size === 'sm',
          'px-4 py-2 text-sm gap-2': size === 'md',
          'px-6 py-3 text-base gap-2.5': size === 'lg',
        },
        className,
      )}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  )
}
