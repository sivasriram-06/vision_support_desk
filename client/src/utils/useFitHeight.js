import { useLayoutEffect, useRef, useState } from 'react'

// Queue board height that fills the window to the bottom edge; re-measures on `dependency` change and resize.
export default function useFitHeight(dependency) {
  const ref = useRef(null)
  const [height, setHeight] = useState(480)
  useLayoutEffect(() => {
    const fit = () => {
      if (!ref.current) return
      const bottomGap = 28 // matches the page's bottom padding
      setHeight(Math.max(320, window.innerHeight - ref.current.getBoundingClientRect().top - bottomGap))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [dependency])
  return [ref, height]
}
