import '../styles/globals.css'
import AppWrapper from '../components/AppWrapper'

export default function App({ Component, pageProps }) {
  return <AppWrapper Component={Component} pageProps={pageProps} />
}
