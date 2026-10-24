import { Link, Route, Routes } from 'react-router-dom'
import './App.css'
import Mvp from './Mvp.tsx'
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
        <h1 className="text-white text-8xl">FormAI</h1>
        <div className="flex">
          <p className="italic text-white">Your practice. Your coach. Your way.</p>
        </div>
      </div>
      <div className="absolute bottom-62 gap-3 left-0 right-0 flex px-10">
        <Link to="/mvp" className="text-white hover:bg-white hover:text-black duration-300 cursor-pointer border-solid border-white border-sm rounded-3xl border py-2 px-5">
          Log In
        </Link>
        <Link to="/mvp" className="text-white hover:bg-white hover:text-black duration-300 cursor-pointer border-solid border-white border-sm rounded-3xl border py-2 px-5">
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
      <Route path="/mvp" element={<Mvp />} />
    </Routes>
  )
}

export default App