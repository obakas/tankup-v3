type MeasurementSectionProps = {
  busy: boolean
  canSubmit: boolean
  measuredVolumeLiters: string
  measurementNote: string
  onMeasuredVolumeLitersChange: (value: string) => void
  onMeasurementNoteChange: (value: string) => void
  onSubmitMeasurement: () => void
}

export default function MeasurementSection({
  busy,
  canSubmit,
  measuredVolumeLiters,
  measurementNote,
  onMeasuredVolumeLitersChange,
  onMeasurementNoteChange,
  onSubmitMeasurement,
}: MeasurementSectionProps) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
          Measurement
        </p>
        <h2 className="!m-0 !text-lg !font-semibold !tracking-normal text-slate-950">
          Delivery quantity notes
        </h2>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
          Litres
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            inputMode="numeric"
            onChange={(event) =>
              onMeasuredVolumeLitersChange(event.target.value)
            }
            value={measuredVolumeLiters}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-normal text-slate-500">
          Note
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-normal normal-case text-slate-950 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            onChange={(event) => onMeasurementNoteChange(event.target.value)}
            placeholder="Tank fill observation or pump duration"
            value={measurementNote}
          />
        </label>

        <div className="flex items-end">
          <button
            className="h-10 w-full rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
            disabled={busy || !canSubmit}
            onClick={onSubmitMeasurement}
            type="button"
          >
            Submit
          </button>
        </div>
      </div>
    </section>
  )
}
