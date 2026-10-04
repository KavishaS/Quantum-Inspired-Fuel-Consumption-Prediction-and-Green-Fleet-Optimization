import { HashRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { Layout } from "@/components/layout/Layout";
import { DemoGuide } from "@/components/layout/DemoGuide";
import { Dashboard } from "@/pages/Dashboard";
import { FuelPredictor } from "@/pages/FuelPredictor";
import { FleetOptimizer } from "@/pages/FleetOptimizer";
import { FuelSandbox } from "@/pages/FuelSandbox";
import { ParetoExplorer } from "@/pages/ParetoExplorer";
import { Benchmarking } from "@/pages/Benchmarking";
import { Compliance } from "@/pages/Compliance";
import { FleetData } from "@/pages/FleetData";
import { ScenarioManager } from "@/pages/ScenarioManager";
import { About } from "@/pages/About";
import { LiveFleetMap } from "@/pages/LiveFleetMap";

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="predictor" element={<FuelPredictor />} />
            <Route path="optimizer" element={<FleetOptimizer />} />
            <Route path="sandbox" element={<FuelSandbox />} />
            <Route path="pareto" element={<ParetoExplorer />} />
            <Route path="benchmark" element={<Benchmarking />} />
            <Route path="compliance" element={<Compliance />} />
            <Route path="fleet" element={<FleetData />} />
            <Route path="scenarios" element={<ScenarioManager />} />
            <Route path="live-map" element={<LiveFleetMap />} />
            <Route path="about" element={<About />} />
          </Route>
        </Routes>
        <DemoGuide />
      </HashRouter>
    </AuthProvider>
  );
}
