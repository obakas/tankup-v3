type OtpConfirmationSectionProps = {
  busy: boolean
  canConfirm: boolean
  otpCode: string
  onConfirmOtp: () => void
  onOtpCodeChange: (value: string) => void
}

export default function OtpConfirmationSection({
  busy,
  canConfirm,
  otpCode,
  onConfirmOtp,
  onOtpCodeChange,
}: OtpConfirmationSectionProps) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
          OTP Confirmation
        </p>
        <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950">
          Customer verification
        </h2>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
          OTP Code
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            inputMode="numeric"
            onChange={(event) => onOtpCodeChange(event.target.value)}
            placeholder="Enter customer OTP"
            value={otpCode}
          />
        </label>

        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
            disabled={busy || !canConfirm}
            onClick={onConfirmOtp}
            type="button"
          >
            Confirm OTP
          </button>
        </div>
      </div>
    </section>
  )
}
