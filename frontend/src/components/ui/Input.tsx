import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ className, label, id, ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <input
        id={id}
        className={cn(
          'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400',
          'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
          'dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400',
          className,
        )}
        {...props}
      />
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function Textarea({ className, label, id, ...props }: TextareaProps) {
  return (
    <div className="space-y-1">
      {label && <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <textarea
        id={id}
        className={cn(
          'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400',
          'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
          'dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400',
          className,
        )}
        {...props}
      />
    </div>
  );
}
