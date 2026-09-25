import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Height for a queue board that fills the window down to the bottom edge
 * (columns scroll inside) instead of a fixed guess that leaves a gap on
 * tall screens. Re-measures when `dependency` changes (e.g. after loading)
 * and on window resize.
 */
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
