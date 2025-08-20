import { Link, Route, Routes } from 'react-router-dom'
import './App.css'

function HomePage() {
  return (
    <>
      <h1>Home</h1>
      <p>Welcome! Try visiting /about or a deep link to verify Netlify redirects.</p>
      <nav>
        <Link to="/">Home</Link> | <Link to="/about">About</Link> |{' '}
        <Link to="/contact">Contact</Link>
      </nav>
    </>
  )
}

function AboutPage() {
  return (
    <>
      <h1>About</h1>
      <p>This SPA is configured for Netlify with a catch‑all redirect to index.html.</p>
      <nav>
        <Link to="/">Home</Link>
      </nav>
    </>
  )
}

function ContactPage() {
  return (
    <>
      <h1>Contact</h1>
      <p>Contact us at contact@example.com</p>
      <nav>
        <Link to="/">Home</Link>
      </nav>
    </>
  )
}

function NotFoundPage() {
  return (
    <>
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <nav>
        <Link to="/">Go back home</Link>
      </nav>
    </>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
