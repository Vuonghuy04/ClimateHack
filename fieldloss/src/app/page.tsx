import { Suspense } from "react";
import { ObservationScreen } from "@/components/observation-screen";
export default function Page() { return <Suspense fallback={<p className="loading">Opening observation…</p>}><ObservationScreen /></Suspense>; }
