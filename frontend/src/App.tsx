import { Link, Route, Routes } from 'react-router-dom'
import './App.css'
import Mvp from './pages/Mvp.tsx'
import Auth from './pages/Auth.tsx'
import Dashboard from './pages/Dashboard.tsx'
import edited_montage from './assets/edited_montage_cropped.mp4'

function HomePage() {
  return (
    <section id="center" className="relative h-svh min-h-0 flex-none overflow-hidden">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-contain"
      >
        <source src={edited_montage} type="video/mp4" />
      </video>
      <div className="absolute inset-0 justify-between flex flex-row items-center px-10">
        <div className="flex">
          <h1 className="text-white font-bold text-8xl">Form</h1>
          <h1 className="text-[#ed7357] font-bold text-8xl">AI</h1>
        </div>
        <div className="flex flex-col">
          <p className="italic text-white text-xl">Your practice. Your coach. Your way.</p>
          <p className="text-white">Improve your game with AI-powered insights.</p>
        </div>
      </div>
      <div className="absolute bottom-62 gap-3 left-0 right-0 flex px-10">
        <Link to="/auth?mode=login" className="text-white hover:bg-white hover:text-black duration-300 cursor-pointer border-solid border-white border-sm rounded-3xl border py-2 px-5">
          Log In
        </Link>
        <Link to="/auth?mode=signup" className="bg-white text-black hover:bg-transparent hover:text-white duration-300 cursor-pointer border-solid border-white border-sm rounded-3xl border py-2 px-5">
          Sign Up
        </Link>
      </div>
    </section>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/mvp" element={<Mvp />} />
    </Routes>
  )
}

export default App