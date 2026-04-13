import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: CardProps) {
  return <div className={cn('px-6 py-4 border-b border-gray-200 dark:border-gray-700', className)} {...props}>{children}</div>;
}

export function CardContent({ className, children, ...props }: CardProps) {
  return <div className={cn('px-6 py-4', className)} {...props}>{children}</div>;
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold text-gray-900 dark:text-white', className)} {...props}>{children}</h3>;
}
