import { Suspense } from "react";
import { PhotoScanScreen } from "@/components/photo-scan-screen";
export default function PhotoPage() { return <Suspense fallback={<p className="loading">Opening photo review…</p>}><PhotoScanScreen /></Suspense>; }
