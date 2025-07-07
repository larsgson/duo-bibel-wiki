import * as React from 'react';
import { useTheme, ThemeProvider } from '@mui/material/styles'
import SettingsView from './settings-view'
import BibleView from './bible-view'
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import useMediaPlayer from '../hooks/useMediaPlayer'
import useBrowserData from '../hooks/useBrowserData'
import { isEmptyObj } from '../utils/obj-functions'

const defaultBackgroundStyle = {
  height: 'auto',
  minHeight: '100vh',
  background: '#181818',
  padding: 0,
  color: 'whitesmoke',
}

export default function AudioBibleNavigationApp() {
  const theme = useTheme();
  const { navHist, startPlay, curPlay, confirmedCountry, pathname} = useMediaPlayer()
  const isPlaying = !isEmptyObj(curPlay)
  const { size } = useBrowserData()
  const isMobileSize = (size === "sm" || size === "xs")
  const [menuValue, setMenuValue] = React.useState(2)
  const [emptyList, setEmptyList] = React.useState(true)
  const [openSettings, setOpenSettings] = React.useState(false)

  const ref = React.useRef(null);

  React.useEffect(() => {
    if ((emptyList) && (navHist)) {
      setEmptyList(false)
      console.log("no longer empty list")
      setMenuValue(0)
    }
  },[navHist,emptyList,setEmptyList,setMenuValue])

  React.useEffect(() => {
    if ((isMobileSize) && (ref.current)) {
      (ref.current).ownerDocument.body.scrollTop = 0;
    // setMessages(refreshMessages());
    }
  }, [menuValue,isMobileSize]);

  const handleStartBiblePlay = (topIdStr,curSerie,bookObj,id) => {
    const {bk} = bookObj
    const curEp = {bibleType: true,bk,bookObj,id}
    startPlay(topIdStr,id,curSerie,curEp)
  }
  const handleOpenSettings = () => {
    setOpenSettings(true)
  }
  const handleConfirmed = () => setOpenSettings(false)
  const mainView = confirmedCountry && !openSettings
  return (
    <div style={defaultBackgroundStyle}>
      <ThemeProvider theme={theme}>
        {!isPlaying && isMobileSize && mainView && (
          <Box sx={{ pb: 7 }} ref={ref}>
            <CssBaseline />
            <BibleView
                onOpenSettings={handleOpenSettings}
                onStartPlay={handleStartBiblePlay}
            />
          </Box>
        )}
        {!isPlaying && !confirmedCountry && (
          <SettingsView initialSettingsMode={true}/>
        )}
        {openSettings && (
          <SettingsView initialSettingsMode={true} onConfirmClick={handleConfirmed}/>
        )}
        {!isPlaying && !isMobileSize && mainView && (
          <Box sx={{ display: 'flex' }}>
            <CssBaseline />
            <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
              <BibleView
                onOpenSettings={handleOpenSettings}
                onStartPlay={handleStartBiblePlay}
              />
            </Box>
          </Box>
        )}
        {isPlaying && (<BibleView
            onStartPlay={handleStartBiblePlay}
        />)}
      </ThemeProvider>
    </div>
)}
