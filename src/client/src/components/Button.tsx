import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

/** Reusable styled button — enforces consistent Tailwind classes. */
export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  const base   = 'px-4 py-2 rounded font-semibold transition-colors focus:outline-none focus:ring-2';
  const styles = {
    primary:   'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400 disabled:opacity-50',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400 disabled:opacity-50',
  };

  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
