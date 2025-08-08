import React, { useState, useEffect, useCallback } from 'react'
import { apiSetStorage, apiGetStorage, apiObjGetStorage, apiObjSetStorage } from '../utils/api'
import { pad } from '../utils/obj-functions'
import { unique } from 'shorthash'
import { useTranslation } from 'react-i18next'
import { serieLang, serieNaviType } from '../utils/dynamic-lang'
import { freeAudioId, freeAudioIdOsisMap } from '../constants/osisFreeAudiobible'
import { contentByLang } from '../constants/content-by-lang'
import { allLangNames } from '../constants/get-languages'
import { 
  audioByID, 
  audioWithTimestampsSet, 
} from '../constants/audio-by-b-id'
import { versesPerCh, getImgSrcString, getValidVerse } from '../constants/naviChaptersJohn'

const MediaPlayerContext = React.createContext([{}, () => {}])
const MediaPlayerProvider = (props) => {
  const [state, setState] = useState({ isPlaying: false })
  const { t, i18n } = useTranslation()
  const setStateKeyVal = (key,val) => setState(state => ({ ...state, [key]: val }))

  const [isPaused, setIsPaused] = useState(false)
  const [imgPosAudio, setImgPosAudio] = useState({})
  const [verseTextPosAudio, setVerseTextPosAudio] = useState([])
  const [verseText, setVerseText] = useState({})
  const [verseText2, setVerseText2] = useState({})
  const [curVerse,setCurVerse] = useState(0)
  const [curLang,setCurLang] = useState()
  const [imgPosLocal,setImgPosLocal] = useState({})
  const [textLocal,setTextLocal] = useState({})
  const apiURLPath = "https://demo-api-bibel-wiki.netlify.app"
  const apiBasePath = `${apiURLPath}/.netlify/functions`
  const [timestampParamStr, setTimestampParamStr] = useState("")
  const [textParamStr, setTextParamStr] = useState("")

  const localTsLangSet = new Set(["swe","nor","hbr","heb","deu"])
  const localTextLangSet = new Set(["deu"])
  const alternativeAudioLangSet = new Set(["deu"])

  const fetchJSONDataFrom = useCallback(async (lang,inx) => {
    const response = await fetch(`/data/${lang}/img_pos${inx +1}.csv`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "text/csv"
      }
    })
    const csv = await response.text()
    const lines = csv.split("\n")
    setImgPosLocal((prev) => ({
      ...prev,
      [inx+1]: lines,
    }))
  }, [])

  useEffect(() => {
    const getDataForAllChapters = async (lang) => {
      const maxStories = 21
      for(let i=0; i < maxStories; i++) {
        // Wait for each task to finish
        await fetchJSONDataFrom(lang,i)
      }      
    }
    if (localTsLangSet.has(curLang)) {
      getDataForAllChapters(curLang)
    }
  }, [fetchJSONDataFrom,curLang])

  const fetchTextFrom = useCallback(async (lang,inx) => {
    const response = await fetch(`/data/${lang}/txt/JHN_${inx +1}.txt`)
    const curText = await response.text()
    const lines = curText.split("\n")
    setTextLocal((prev) => ({
      ...prev,
      [inx+1]: lines,
    }))
  }, [])

  useEffect(() => {
    const getTextForAllChapters = async (lang) => {
      const maxStories = 21
      for(let i=0; i < maxStories; i++) {
        // Wait for each task to finish
        await fetchTextFrom(lang,i)
      }      
    }
    if (localTextLangSet.has(curLang)) {
      getTextForAllChapters(curLang)
    }
  }, [fetchTextFrom,curLang])

  useEffect(() => {
    const getLocationData = async () => {
      const usePath = `${apiURLPath}/geolocation`
      const response = await fetch(usePath)
      const data = await response.json()
      console.log(data?.country?.code)
      return data?.country?.code
    }
    const getCurCountry = async () => {
      const curCountry = await apiGetStorage("selectedCountry")
      setStateKeyVal("selectedCountry",curCountry)
    }
    const getNavHist = async () => {
      const navHist = await apiGetStorage("navHist")
      setState(prev => ({...prev, navHist}))
    }
    const parsePathNLang = async () => {
      const curPathStr = window.location.pathname
      setStateKeyVal("pathname",curPathStr)
      const resArr = (curPathStr?.split("/"))
      if ((resArr) && (resArr.length>2) && (!!allLangNames[resArr[1]]) && (!!allLangNames[resArr[2]])) {
        setStateKeyVal("selectedLanguage",resArr[1])
        setCurLang(resArr[1])
        setStateKeyVal("activeLangListStr",JSON.stringify([resArr[1],resArr[2]]))
        setStateKeyVal("confirmedCountry",true)
      } else {
        const useLang = await apiGetStorage("selectedLanguage")
        if (useLang) {
          setCurLang(resArr[1])
          setStateKeyVal("selectedLanguage",useLang)
        } 
        const curLangs = await apiGetStorage("activeLangListStr")
        if (curLangs) {
          setStateKeyVal("activeLangListStr",curLangs)
        }
        const curConfirmedCountry = await apiGetStorage("confirmedCountry")
        if (curConfirmedCountry) {
          setStateKeyVal("confirmedCountry",true)
        } else {
          console.log(`Check location`)
          const detectedCountry = await getLocationData()
          console.log(`Country: ${detectedCountry}`)
          setStateKeyVal("detectedCountry",detectedCountry)
        }  
      }
    }
    parsePathNLang()
    getCurCountry()
    getNavHist()
  }, [])


  useEffect(() => {
    const getLangData = async (useLangListStr) => {
      if (useLangListStr && useLangListStr.length>0) {
        let curLangData = {}
        if (state.langDataJsonStr && state.langDataJsonStr.length>0) {
          curLangData = JSON.parse(state.langDataJsonStr)
        }
        const useLangList = JSON.parse(useLangListStr)
        await Promise.all(useLangList.filter(l => (!curLangData.hasOwnProperty(l))).map(async langCode => {
          const usePath = `${apiURLPath}/.netlify/functions/get-content-by-lang`
          const response = await fetch(usePath, {
            method: 'POST',
            body: JSON.stringify({
              langCode,
              query: ["a","t"]
            })
          }).then(response => response.json())
          curLangData[langCode] = response?.data
        }))
        setStateKeyVal("langDataJsonStr",JSON.stringify(curLangData))
      }
    }
    if ((state?.activeLangListStr) && (state.activeLangListStr.length>0)) getLangData(state.activeLangListStr)
  }, [state.activeLangListStr])

  useEffect(() => {
    const getCurCountryData = async (useCountry) => {
      const usePath = `${apiURLPath}/.netlify/functions/get-languages`
      const response = await fetch(usePath, {
        method: 'POST',
        body: JSON.stringify({
          countryCodeList: [useCountry,"*"],
          query: ["a","t"]
        })
      }).then(response => response.json())
      setStateKeyVal("curCountryJsonStr",JSON.stringify(response?.data[useCountry]))
      setStateKeyVal("langListJsonStr",JSON.stringify(response?.data?.allLanguages))
    }
    if ((state?.selectedCountry) && (state.selectedCountry.length>0)) {
      getCurCountryData(state.selectedCountry)
    } else if ((state?.detectedCountry) && (state.detectedCountry.length>0)) {
      getCurCountryData(state.detectedCountry)
    }
  }, [state.selectedCountry,state.detectedCountry])

  useEffect(() => {
    const getTimecodeData = async () => {
      if (timestampParamStr?.length>0) {
        const fetchTimestampPath = `${apiBasePath}/get-timestamps`
        const curApiParam = JSON.parse(timestampParamStr)
        // const curBook = osisFromFreeAudioId(curApiParam?.bookID)
        // const curBookInx = freeAudioId.findIndex(el => (el === curApiParam?.bookID)) +1
        const curCh = curApiParam?.ch
        let resData
        const activeLangList = state.activeLangListStr ? JSON.parse(state.activeLangListStr) : []
        const resTimestamp = await fetch(fetchTimestampPath, {
          method: 'POST',
          body: timestampParamStr
        })
        .then(resTimestamp => resTimestamp.json())
        .catch(error => console.error(error))
        resData = resTimestamp?.data
        setVerseTextPosAudio(resData)
        const timestampPoints = [...Array(versesPerCh[curCh-1])].map((_,i) => {
          return {
            img: getImgSrcString(curCh,i+1) || getImgSrcString(curCh,getValidVerse(curCh,i+1)),
            pos: resData[i]?.timestamp
          }
        })
        setImgPosAudio(timestampPoints)
      }
    }
    getTimecodeData()
  }, [timestampParamStr])

  useEffect(() => {
    const getTextData = async () => {      
      if (textParamStr.length>0) {
        const tempParam = JSON.parse(textParamStr)
        const textParamStr1 = JSON.stringify({ ...tempParam })
        const textParamStr2 = JSON.stringify({ ...tempParam, filesetID: tempParam.filesetID2 })
        const fetchTextPath = `${apiBasePath}/get-text`
        if (tempParam?.filesetID) {
          const resText = await fetch(fetchTextPath, {
            method: 'POST',
            body: textParamStr1
          })
          .then(resText => resText.json())
          .catch(error => console.error(error))
          const useVerseText = {}
          resText?.data.forEach(obj => {
            useVerseText[obj.verse_start] = obj.verse_text
          })
          setVerseText(useVerseText)
        }
        const resText2 = await fetch(fetchTextPath, {
          method: 'POST',
          body: textParamStr2
        })
        .then(resText2 => resText2.json())
        .catch(error => console.error(error))
        const useVerseText2 = {}
        resText2?.data.forEach(obj => {
          useVerseText2[obj.verse_start] = obj.verse_text
        })
        setVerseText2(useVerseText2)
      }
    }
    getTextData()
  }, [textParamStr])

  const getAudioFilesetId = (langID) => {
    let hasTs = false
    let filesetID = undefined
    let curPriority = 0
    let idList
    let langData
    if (state.langDataJsonStr && state.langDataJsonStr.length>0) {
      langData = JSON.parse(state.langDataJsonStr)
      if (langData?.a) {
        // idList = Object.keys(langData?.a)
        console.log(idList)
      }
    }
    const audioIdList = contentByLang[langID]?.a
    audioIdList && audioIdList.forEach(audioID => {
      if (idList && idList.includes(audioID)) {
        const idData = langData.a[audioID]
        hasTs = idData.ts
        const fsIdList = Object.keys(idData?.fs)
        if (fsIdList && fsIdList.length>0) {
          fsIdList.filter(key => (key.indexOf("opus")<0)).forEach(key => {
            // const fsObj = idData.fs[key]
            const typeStr = key.substring(6,8)
            const dramaType = (typeStr.length>1) && (typeStr[1] === "2")
            const hasNT = (typeStr.length>1) && (typeStr[0] === "N")
            let chkP = dramaType ? 2 : 1
            const fullStr = key
            // Always prioritise higher for audio with timestamps - add 10
            if (idData.ts) chkP += 10
            if ((hasNT) && (chkP>curPriority)) {
              if (idData.ts) console.log("hasTS")
              curPriority = chkP 
              filesetID = fullStr
            }
          })
        }
      } else {
        const fIdList = audioByID[audioID]
        if (fIdList) {
          fIdList.forEach(aType => {
            const chkType = aType.substring(1)
            let chkP = parseInt(chkType)
            // Always prioritise higher for audio with timestamps - add 10
            const useIdStr = `${audioID}${aType}DA`
            if (audioWithTimestampsSet.has(useIdStr)) chkP += 10
            if (chkP>curPriority) {
              curPriority = chkP 
              filesetID = useIdStr
            }
          })
        }
      }
    })
    if (!filesetID) {
      // Check other options from all idList entries
      if (idList && idList.length>0) {
        idList.forEach(idStr => {
          if (!hasTs) { // Stop searching after first audio with timestampa
            const idData = langData.a[idStr]
            hasTs = idData.ts
            const fsIdList = Object.keys(idData?.fs)
            if (fsIdList && fsIdList.length>0) {
              fsIdList.forEach(key => {
                // const fsObj = idData.fs[key]
                const typeStr = key.substring(6,8)
                console.log(typeStr)
                const dramaType = (typeStr.length>1) && (typeStr[1] === "2")
                let chkP = dramaType ? 2 : 1
                const fullStr = key
                // Always prioritise higher for audio with timestamps - add 10
                if (idData.ts) chkP += 10
                if (chkP>curPriority) {
                  curPriority = chkP 
                  filesetID = fullStr
                }
              })
            }
          }
        })
      }
    }
    return filesetID
  }
  
  const getTextFilesetId = (langID,audioID) => { 
    let retFilesetID = "" 
    let idList
    let langData
    if (state.langDataJsonStr && state.langDataJsonStr.length>0) {
      langData = JSON.parse(state.langDataJsonStr)
      if (langData?.t) {
        idList = Object.keys(langData?.t)
        console.log(idList)
      }
    }
    const textIDList = contentByLang[langID]?.t
    textIDList && textIDList.forEach(tID => {
      if (idList && idList.includes(tID)) {
        const idData = langData.t[tID]
        const fsIdList = Object.keys(idData?.fs)
        if (fsIdList && fsIdList.length>0) {
          fsIdList.filter(key => (key.indexOf("json")<0)).forEach(key => {
            const fsObj = idData.fs[key]
            if (fsObj?.size==="NT") {
              console.log(key)
              retFilesetID = key
            }
          })
        }
      } else if (textIDList.length>0) {
        retFilesetID = textIDList[0] // select first entry by default
        if (textIDList.length>1) // go through list, if more than one
        textIDList.forEach(checkID => {
          // Prioritise equal to audioID, if exists
          if (checkID===audioID) retFilesetID = checkID
        })
      }
    })
    return retFilesetID
  }
  

  const togglePlay = () => {
//    state.isPlaying ? player.pause() : player.play()
    setStateKeyVal( "isPlaying", !state.isPlaying )
  }

  const skipToNextTrack = () => {
//    playTrack(newIndex)
  }

  const setSelectedCountry = async (newCountry) => {
    setStateKeyVal("selectedCountry",newCountry)
    await apiSetStorage("selectedCountry",newCountry)
  }

  const setSelectedLanguage = async (newLang) => {
    setStateKeyVal("selectedLanguage",newLang)
    await apiSetStorage("selectedLanguage",newLang)
  }

  const setConfirmedCountry = async (newCountry) => {
    setStateKeyVal("selectedCountry",newCountry)
    await apiSetStorage("selectedCountry",newCountry)
    setStateKeyVal("confirmedCountry",true)
    await apiSetStorage("confirmedCountry",true)
  }

  const updateActiveLang = async (newLangList) => {
    const newUniqueArr = [ ...new Set(newLangList)]
    const newStr = JSON.stringify(newUniqueArr)
    setStateKeyVal("activeLangListStr",newStr)
    await apiSetStorage("activeLangListStr",newStr)
  }

  const addActiveLang = async (newLang) => {
    const activeLangList = state.activeLangListStr ? JSON.parse(state.activeLangListStr) : []
    await updateActiveLang([ ...activeLangList, newLang ])
  }

  const onFinishedPlaying = () => {
    console.log("onFinishedPlaying")
    if (state.curPlay) {
      apiObjSetStorage(state.curPlay,"mSec",state.curEp.begTimeSec * 1000) // Reset the position to beginning
      const {curSerie, curEp} = state.curPlay
      if (curSerie){
        if ((curSerie.episodeList!=null) && (curSerie.episodeList.length>0)
            && (curEp!=null)){
          // This serie has episodes
          let epInx = curEp.id
          epInx+=1
          let newPlayObj = {curSerie}
          apiObjSetStorage(newPlayObj,"curEp",epInx)
          if (curSerie.episodeList[epInx]!=null){
            newPlayObj.curEp=curSerie.episodeList[epInx]
          }
          setStateKeyVal( "curPlay", newPlayObj)
        } else {
          let newPlayObj
          setStateKeyVal( "curPlay", newPlayObj)
        }
      }
    }
  }

  const onStopPlaying = () => {
    setStateKeyVal( "curPlay", undefined )
    setStateKeyVal( "curSerie", undefined )
    setStateKeyVal( "curEp", undefined )
  }

  const updateImgBasedOnPos = ( navType, ep, curInx, msPos ) => {
    let curImgSrc = ""
    let retStr = ""
    if (imgPosAudio && imgPosAudio?.length>0) {
      imgPosAudio?.map(checkObj => {
        const checkMs = parseInt(checkObj.pos) * 1000
        if (msPos>=checkMs) curImgSrc = checkObj.img
      })
      const bookObj = ep?.bookObj
      let checkLang = ep?.lang
      if (!checkLang) {
        const activeLangList = state.activeLangListStr ? JSON.parse(state.activeLangListStr) : []
        checkLang = (activeLangList.length>0) ? activeLangList[0] : "eng"
      }
      retStr = curImgSrc
    }
    return retStr
  }

  const updateTextBasedOnPos = ( msPos ) => {
    let retStr = ""
    let checkVerseInx = 0
    const offsetMs = 300
    const checkMsPosArray = verseTextPosAudio
    const checkVerse = curVerse
    if ((checkMsPosArray) && (checkMsPosArray?.length>0)) {
      checkMsPosArray?.map(checkObj => {
        const checkMs = checkObj.timestamp * 1000
        if ((msPos+offsetMs)>=checkMs) checkVerseInx = parseInt(checkObj.verse_start)
      })
    }
    if ((checkVerseInx>1) && (checkVerse!==checkVerseInx)) {
      setIsPaused(true)
      setCurVerse(checkVerseInx)
    }
    if (checkVerseInx>0) retStr = verseText[checkVerseInx] || ""
    return retStr
  }

  const updateText2BasedOnPos = ( msPos ) => {
    let retStr = ""
    let checkVerseInx = 0
    const offsetMs = 300
    const checkMsPosArray = verseTextPosAudio
    if ((checkMsPosArray) && (checkMsPosArray?.length>0)) {
      checkMsPosArray?.map(checkObj => {
        const checkMs = checkObj.timestamp * 1000
        if ((msPos+offsetMs)>=checkMs) checkVerseInx = parseInt(checkObj.verse_start)
      })
    }
    if (checkVerseInx>0) retStr = verseText2[checkVerseInx] || ""
    return retStr
  }
  
  const onPlaying = (curPos) => {
    const curImgSrc = state?.syncImgSrc
    const curInx = state?.curEp?.id
    const msPos = curPos?.position
    let nextImgSrc
    const curEp = state?.curPlay?.curEp

    nextImgSrc = updateImgBasedOnPos( "audioBible", curEp, curInx, msPos )
    if (nextImgSrc!==curImgSrc) {
      setStateKeyVal( "syncImgSrc", nextImgSrc )
    }
    let nextText
    const curVerseText = state?.syncVerseText
    nextText = updateTextBasedOnPos( msPos )
    if (nextText!==curVerseText) {
      setStateKeyVal( "syncVerseText", nextText )
    }
    let nextText2
    const curVerseText2 = state?.syncVerseText2
    nextText2 = updateText2BasedOnPos( msPos )
    if (nextText2!==curVerseText2) {
      setStateKeyVal( "syncVerseText2", nextText2 )
    }
    setStateKeyVal( "curPos", curPos )
  }

  const startPlay = async (topIdStr,inx,curSerie,curEp) => {
    const lang = serieLang(topIdStr)
    if (curSerie.bbProjectType) {
      let audioFilesetID 
      if (alternativeAudioLangSet.has(lang)) {
        const chStr = pad(curEp?.id)
        curSerie.curPath = `https://info2.sermon-online.com/german/DieBibelInDeutscherFassung/430${chStr}-Das_Evangelium_Nach_Johannes_Kapitel-0${chStr}.mp3`
      } else {
        const fetchPath = `${apiBasePath}/get-audio-url`
        audioFilesetID = getAudioFilesetId(curSerie.langID)
        console.log(audioFilesetID)
        const response = await fetch(fetchPath, {
          method: 'POST',
          body: JSON.stringify({
            filesetID: audioFilesetID,
            bookID: freeAudioIdOsisMap[curEp?.bk],
            ch: curEp?.id,
            query: ["path"]
          })
        }).then(response => response.json())
        curSerie.curPath = response?.data?.path
      }
      const activeLangList = JSON.parse(state?.activeLangListStr)
      const tempLangList = (activeLangList) ? activeLangList.slice(0,2) : []
      let filesetID
      if (!localTextLangSet.has(curLang)) {
        filesetID = getTextFilesetId(tempLangList[0],audioFilesetID)
      } else {
        const useText = textLocal[curEp?.id]
        const useVerseText = {}
        let inx = 1
        useText?.forEach(str => {
          useVerseText[inx] = str
          inx += 1
        })
        setVerseText(useVerseText)
      }
      setTextParamStr(JSON.stringify({
        filesetID,
        filesetID2: getTextFilesetId(tempLangList[1],audioFilesetID),
        bookID: freeAudioIdOsisMap[curEp?.bk],
        ch: curEp?.id,
        query: ["verse_text", "verse_start"]
      }))
      if (audioWithTimestampsSet.has(audioFilesetID)) {
        // fetch timecode in the background
        setTimestampParamStr(JSON.stringify({
          filesetID: audioFilesetID,
          bookID: freeAudioIdOsisMap[curEp?.bk],
          ch: curEp?.id,
          query: ["verse_start", "timestamp"]
        }))
      } else {
        setTimestampParamStr("")
        if (localTsLangSet.has(curLang)) {
          const curCh = curEp?.id
          const timestampPoints = imgPosLocal[curCh].map((_,i) => {
            const posStr = (i>0) ? imgPosLocal[curCh][i-1] : "0"
            const pos = parseFloat(posStr)
            return {
              img: getImgSrcString(curCh,i+1) || getImgSrcString(curCh,getValidVerse(curCh,i+1)),
              pos
            }
          })
          setImgPosAudio(timestampPoints)
          const imgPosList = imgPosLocal[curCh].map((_,i) => {
            const timestampStr = (i>0) ? imgPosLocal[curCh][i-1] : "0"
            const timestamp = parseFloat(timestampStr)
            return {
              verse_start: i+1,
              timestamp
            }
          })
          setVerseTextPosAudio(imgPosList)
        }
      }
    }
    if (!curSerie) { // stop playing
      let newPlayObj
      setStateKeyVal( "curPlay", newPlayObj)
    } else {
      let tmpEp = curEp
      if ((!tmpEp) && (curSerie.episodeList!=null)
          && (curSerie.episodeList[inx]!=null)){
        tmpEp=curSerie.episodeList[inx]
      }
      // This serie has episodes
      let newPlayObj = {curSerie,curEp}
      if (curEp!=null) {
//          props.onStartPlay && props.onStartPlay(curSerie,curEp)
        await apiObjSetStorage({curSerie},"curEp",curEp.id)
        setStateKeyVal( "curPlay", newPlayObj)
      } else {
        apiObjGetStorage(newPlayObj,"curEp").then((value) => {
          if ((value==null)||(curSerie && curSerie.episodeList && curSerie.episodeList[value]==null)){
            value=0
            apiObjSetStorage(newPlayObj,"curEp",0)
          }
          if (curSerie && curSerie.episodeList && curSerie.episodeList[value]!=null){
            newPlayObj.curEp=curSerie.episodeList[value]
          }
//            props.onStartPlay && props.onStartPlay(curSerie,curSerie.episodeList[value])
          setStateKeyVal( "curPlay", newPlayObj)
        }).catch((err) => {
          console.error(err)
        })
      }
      const curSerId = curSerie.uniqueID || unique(curSerie.title)
      const nType = serieNaviType(topIdStr)
      const langID = curSerie.langID
      const navHistEp = {...tmpEp,topIdStr,lang,langID}
      const navHist = {...state.navHist, [curSerId]: navHistEp}
      await apiSetStorage("navHist",navHist)
      await apiSetStorage("curSerId",curSerId)
      const curInx = tmpEp?.id
      const syncImgSrc = 
        ((curSerId === "uW.OBS.en") || (nType === "audioBible")) 
          ? updateImgBasedOnPos( nType, curEp, curInx, 0 ) 
          : ""
      const syncVerseText = updateTextBasedOnPos( 0 ) 
      const syncVerseText2 = updateText2BasedOnPos( 0 ) 
      setState(state => ({...state, navHist, syncImgSrc, syncVerseText, syncVerseText2, curSerId, curSerie, curEp: tmpEp}))
      // setState(state => ({...state, syncImgSrc, curSerId, curSerie,erId, curSeri2e, curEp: tmpEp}))
    }
  }

  const value = {
    state: {
      ...state,
      isPaused,
    },
    actions: {
      setState,
      startPlay,
      togglePlay,
      onStopPlaying,
      onPlaying,
      onFinishedPlaying,
      setIsPaused,
      setSelectedCountry,
      setSelectedLanguage,
      setConfirmedCountry,
      updateActiveLang,
      addActiveLang,
      skipToNextTrack,
    }
  }

  return (
    <MediaPlayerContext.Provider value={value}>
      {props.children}
    </MediaPlayerContext.Provider>
  )
}

//viewLibrary,

export {MediaPlayerContext, MediaPlayerProvider}
