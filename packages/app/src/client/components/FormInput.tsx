import { forwardRef } from "react";

type FormInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label?: string;
  hint?: string;
};

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  function FormInput({ label, hint, ...props }, ref) {
    return (
      <div>
        {label && <label className="text-xs text-gray-500 block mb-1">{label}</label>}
        <input
          ref={ref}
          {...props}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {hint && <p className="text-[10px] text-gray-600 mt-1">{hint}</p>}
      </div>
    );
  }
);
