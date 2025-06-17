import {useState} from 'react';
import { useTranslation } from 'react-i18next'
// import { navLangList } from '../constants/languages'
import SimpleAppBar from './simple-app-bar'
import ImageList from '@mui/material/ImageList'
import ImageListItem from '@mui/material/ImageListItem'
import ImageListItemBar from '@mui/material/ImageListItemBar'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CheckIcon from '@mui/icons-material/Check'
import CssBaseline from '@mui/material/CssBaseline';
import Toolbar from '@mui/material/Toolbar';
import { cCode } from '../constants/country-codes'
import useBrowserData from '../hooks/useBrowserData'
import useMediaPlayer from '../hooks/useMediaPlayer'
import { langWithTimestampsSet } from '../constants/audio-by-b-id'

const navLangList = {
  deu:{en:"German",n:"Deutsch"},
  fre:{en:"French",n:"Français"},
  spa:{en:"Spanish",n:"Español"},
  eng:{en:"English",n:"English"},
}

const LangGridBar = (props) => {
  // eslint-disable-next-line no-unused-vars
  const { classes, title, subtitle } = props
  return (
      <ImageListItemBar
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        // p: 1,
        // m: 1,
      }}
        // title={<Typography sx={{ fontSize: '12px' }}>{title}</Typography>}
        title={title}
        subtitle={subtitle}
      />
  )
}

const capitalizeFirstLetter = ([ first='', ...rest ]) => [ first.toUpperCase(), ...rest ].join('')

const getNameLabel = (nameObj) => {
  let label = ""
  if ((nameObj?.en) && (nameObj?.en === nameObj?.n)) {
    label = nameObj?.n
  } else if ((nameObj?.n) && (nameObj?.en)) {
    label = `${nameObj?.n} - ${nameObj?.en}`
  } else if (nameObj?.n) {
    label = nameObj?.n
  } else {
    label = nameObj?.en || ""
  }
  return label
}

const mapOptions = (code,nameObj) => {
  return {
    value: code,
    label: getNameLabel(nameObj)
   } 
}

const navCountryOptions = Object.keys(cCode).map((code) => mapOptions(code,cCode[code]))
const navLangOptions = Object.keys(navLangList).map((code) => mapOptions(code,navLangList[code]))

export default function SettingsView({onConfirmClick,initialSettingsMode}) {
  const { t, i18n } = useTranslation();
  const { size } = useBrowserData()
  const { 
    detectedCountry, 
    selectedCountry,
    activeLangListStr, 
    curCountryJsonStr, 
    langListJsonStr,
    langDataJsonStr,
    setSelectedCountry,
    setConfirmedCountry,
    updateActiveLang,
  } = useMediaPlayer()
  const curCountryLangList = (curCountryJsonStr) && JSON.parse(curCountryJsonStr)
  const langList = (langListJsonStr) && JSON.parse(langListJsonStr)
  const defaultLang = "eng"
  const activeLangList = activeLangListStr ? JSON.parse(activeLangListStr) : [defaultLang]
  const curCountry = selectedCountry || detectedCountry
  const langData = (langDataJsonStr) && JSON.parse(langDataJsonStr)

  const checkTSAvailable = (l) => {
    let retVal = false
    if ((langData) && (langData[l])) {
      Object.keys(langData[l].a).forEach(id => {
        if (langData[l].a[id].ts) retVal = true
      })
    }
    return retVal
  }
  const audioLangListInfo = {}
  const langListInfo = {}
  const tempObj = (curCountryLangList) && curCountryLangList.a
  if (tempObj) {
    Object.keys(tempObj).forEach(lKey => {
      langListInfo[lKey] = tempObj[lKey]
      if (langWithTimestampsSet.has(lKey)) {
        audioLangListInfo[lKey] = tempObj[lKey]
      }
    })
  }
  activeLangList && activeLangList.forEach(l => {
    const ts = checkTSAvailable(l) 
    langListInfo[l] = { ts }
    if (l => langWithTimestampsSet.has(l)) audioLangListInfo[l] = { ts }
  })
  const langKeyArr = (langList) && Object.keys(langList) || []
  const availableLangOptions = langKeyArr.map(lKey => {
    return {value: lKey,label: getNameLabel(langList[lKey])}              
  })
  const availableAudioLangOptions = langKeyArr.filter(l => langWithTimestampsSet.has(l)).map(lKey => {
      return {value: lKey,label: getNameLabel(langList[lKey])}              
  })
  let useCols = 3
  if (size==="xs") useCols = 2
  else if (size==="lg") useCols = 4
  else if (size==="xl") useCols = 5

  const handleLangClick = (l) => {
    const newList = 
      activeLangList.includes(l) 
        ? activeLangList.filter(i => i !== l)
        : [...activeLangList, l] 
    console.log(newList)
    updateActiveLang(newList)
  }
  const handleConfirmClick = () => {
    if (activeLangList.length<=0) addActiveLang(defaultLang)
      setConfirmedCountry(curCountry)
    if (onConfirmClick) {
      onConfirmClick()
    }
  }
  const handleCountryChange = (newCountry) => setSelectedCountry(newCountry) 
  let selAudioLang = {value: "eng", label: "English"}
  let selOtherLang = {value: "", label: ""}
  if (langList) {
    if (activeLangList && activeLangList.length>0) {
      const l = activeLangList[0]
      selAudioLang = mapOptions(l,langList[l])
    }
    if (activeLangList && activeLangList.length>1) {
      const l = activeLangList[1]
      selOtherLang = mapOptions(l,langList[l])
    }
  }
  return (
    <Box sx={{ tp: 3 }}>
      <CssBaseline />
      {initialSettingsMode && (<SimpleAppBar position="fixed">
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            Bible Wiki
          </Typography>
          <Button
            variant="contained"
            color="success"
            aria-label="confirm settings"
            disabled={activeLangList.length<2}
            onClick={handleConfirmClick}
            startIcon={<CheckIcon />}
          >Confirm Languages
          </Button>
        </Toolbar>
      </SimpleAppBar>)}
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <div className="Settings-header">
          <div>Country</div>
          <Autocomplete
            id="country-autocomplete"
            disablePortal
            options={navCountryOptions}
            sx={{ 
              width: 'auto',
              backgroundColor: "lightgrey"
            }}
            renderInput={(params) => <TextField {...params} label="Country" />}
            value={mapOptions(curCountry,cCode[curCountry])}
            onChange={(event, newValue) => {
              if (newValue) {
                handleCountryChange(newValue.value)
              }
            }}
          />
          <br/>
          <br/>
          <div>Audio language</div>
          <br/>
          <Autocomplete
            id="audio-lang-autocomplete"
            disablePortal
            options={availableAudioLangOptions}
            sx={{ 
              width: '100%',
              backgroundColor: "lightgrey"
            }}
            renderInput={(params) => <TextField {...params} label="Languages" />}
            value={selAudioLang}
            onChange={(event, newValue) => {
              if (newValue) {
                const newList = [...activeLangList]
                if (newList.length>0) newList[0] = newValue.value
                updateActiveLang(newList)
              }
            }}
          />
          <br/>
          <br/>
          <div>Other language</div>
          <br/>
          <Autocomplete
            id="lang-autocomplete"
            disablePortal
            options={availableLangOptions}
            // getOptionDisabled={(option) =>option?.value === i18n.language}
            sx={{ 
              width: '100%',
              backgroundColor: "lightgrey"
            }}
            renderInput={(params) => <TextField {...params} label="Languages" />}
            value={selOtherLang}
            onChange={(event, newValue) => {
              if (newValue) {
                const newList = [...activeLangList]
                if (newList.length>0) newList[1] = newValue.value
                updateActiveLang(newList)
              }
            }}
          />
          <br/>
          {audioLangListInfo && (
            <ImageList
              rowHeight={120}
              cols={useCols}
              gap={9}
              sx={{overflowY: 'clip'}}
            >
              {Object.keys(audioLangListInfo).map((lng) => {
                const langData = langList && langList[lng]
                let nativeStr = ""
                let subtitle = undefined
                if ((lng === "en") || (langData?.en === langData?.n)) {
                  nativeStr = langData?.n
                } else if (!langData?.n) {
                  nativeStr = langData?.en
                } else {
                  nativeStr = langData?.n
                  subtitle = langData?.en
                }
                let title = nativeStr
                if (lng.length>3) {
                  const countryCode = lng.slice(3,5)
                  title = `${nativeStr} (${countryCode})`
                }
                const shortNativeStr = ((curCountry === "IN") && (nativeStr)) ? nativeStr.substring(0,3) : lng
                const shortLang = capitalizeFirstLetter(shortNativeStr)
                const isActive = activeLangList.includes(lng) 
                const curData = audioLangListInfo[lng]
                const bkgdColor = (curData?.ts) ? isActive ? 'lightgreen' :`green` : isActive ? 'lightblue' : `#020054`
                return (
                  <span key={lng}>
                    <ImageListItem onClick={() => handleLangClick(lng)}>
                      <Typography 
                        sx={{ 
                          fontSize: '30px',
                          backgroundColor: bkgdColor
                        }}>
                        {shortLang}
                      </Typography>
                      <Typography 
                        sx={{ 
                          paddingTop: '12px',
                          fontSize: '13px',
                          backgroundColor: '#444' 
                        }}>
                        {title}
                      </Typography>
                      <Typography 
                        sx={{ 
                          fontSize: '11px',
                          backgroundColor: '#444',
                          paddingBottom: '8px',
                        }}>
                        {subtitle}
                      </Typography>
                    </ImageListItem>
                  </span>
                )}
              )}
            </ImageList>
          )}
          <div 
            style={{
              paddingBottom: 30,
              // m: 1,
            }}
          >
          <br/>
        {/* <button onClick={() => window.open("https://github.com/larsgson/bibel-wiki/blob/main/roadmap.md", "_blank")}>
          Road map
        </button> */}
        </div>

        </div>
      </Box>
    </Box>
  );
}
