import React, { useState, useEffect } from 'react'
import Typography from '@mui/material/Typography'
import Fab from '@mui/material/Fab'
import Language from '@mui/icons-material/Language'
import ImageList from '@mui/material/ImageList'
import ImageListItem from '@mui/material/ImageListItem'
import ImageListItemBar from '@mui/material/ImageListItemBar'
import { rangeArray, isEmptyObj } from '../utils/obj-functions'
import { 
  selectAudioBible,
  getSerie,
} from '../utils/dynamic-lang'
import { getChIcon } from '../utils/icon-handler'
import useBrowserData from '../hooks/useBrowserData'
import useMediaPlayer from "../hooks/useMediaPlayer"
import { naviSortOrder, chInBook,
  naviBooksLevel1, naviBooksLevel2, naviChapters } from '../constants/naviChapters'

const SerieGridBar = (props) => {
  // eslint-disable-next-line no-unused-vars
  const { classes, title, subtitle } = props
  return (
      <ImageListItemBar
        title={title}
        subtitle={subtitle}
      />
  )
}

const BibleView = (props) => {
  // eslint-disable-next-line no-unused-vars
  const { size } = useBrowserData()
  const { 
    curPlay, 
    pathname,
    syncImgSrc, 
    syncVerseText, 
    syncVerseText2, 
    activeLangListStr,
    selectedLanguage,
  } = useMediaPlayer()
  const isPlaying = !isEmptyObj(curPlay)
  const { onOpenSettings, onStartPlay } = props
  const activeLangList = activeLangListStr ? JSON.parse(activeLangListStr) : []
  const pathExists = ((pathname) && (pathname.length>1))
  const lng = selectedLanguage || ((activeLangList.length>0) ? activeLangList[0] : "eng")
  const [curLevel, setCurLevel] = useState(4)
  const [level0, setLevel0] = useState("")
  const [level1, setLevel1] = useState(7)
  const [level2, setLevel2] = useState("d")
  const [level3, setLevel3] = useState(0)
  const [skipLevelList,setSkipLevelList] = useState([])
  // const lng = i18n.language
  // ToDo !!! find a bibleBookList and use this here
  // eslint-disable-next-line no-unused-vars
  const getSort = (val) => naviSortOrder.indexOf(parseInt(val))
  const addSkipLevel = (level) => setSkipLevelList([...skipLevelList,level])

  useEffect(() => {
    const useSerieId = selectAudioBible(lng)
    setLevel0(useSerieId)
  }, [lng,setLevel0])

  // eslint-disable-next-line no-unused-vars
  const handleClick = (ev,id,_isBookIcon) => {
    console.log(id)
    if (curLevel===0) {
      setLevel0(id)
      setCurLevel(1)
    } else if (curLevel===1) {
      setLevel1(id)
      setCurLevel(2)
    } else if (curLevel===2) {
      setLevel2(id)
      if (naviChapters[level1][id].length===1){
        setLevel3(0)
        setCurLevel(4)
      } else setCurLevel(3)  
    } else if (curLevel===3) {
      setLevel3(id)
      setCurLevel(4)
    } else {
      const bookObj = {
        ...naviChapters[level1][level2][level3], 
        level1, 
        level2, 
        level3,
        title: "test"
      }
      const curSerie = {
        ...getSerie(lng,level0),
        title: `${bookObj.bk} ${id}`
      }
      onStartPlay(level0,curSerie,bookObj,id)
    }
  }

  const navigateUp = (level) => {
    if (skipLevelList.includes(level)) {
      navigateUp(level-1)
    } else {
      setCurLevel(level)
      if (level===0) setLevel0("audioBible")
    }
  }

  const handleOpenSettings = () => {
    if (onOpenSettings) {
      console.log("!")
       onOpenSettings()
    }
  }
   
  let validIconList = []
  let validBookList = []
  if (curLevel>0){
    if (curLevel===1){
      let lastInx
      const curSerie = getSerie(lng,level0)
      const curList = (curSerie!=null && curSerie.bibleBookList) ? curSerie.bibleBookList : []
      Object.keys(naviBooksLevel1).sort((a,b)=>getSort(a)-getSort(b)
      ).forEach(iconInx => {
        const foundList = naviBooksLevel1[iconInx].filter(x => curList.includes(x))
        validBookList.push(...foundList)
        if (foundList.length>0){
          lastInx = iconInx
          validIconList.push(getChIcon(iconInx,level0,iconInx))
        }
      })
      if (validIconList.length===1) {
        setLevel1(lastInx)
        setCurLevel(2)
        addSkipLevel(1)
        validIconList = []
        validBookList = []
      }
    }
    if (curLevel===2){
      let lastLetter
      const curSerie = getSerie(lng,level0)
      const curList = (curSerie!=null) ? curSerie.bibleBookList : []
      Object.keys(naviChapters[level1]).forEach(iconLetter => {
        const foundList = naviBooksLevel2[level1][iconLetter].filter(x => curList.includes(x))
        validBookList.push(...foundList)
        if (foundList.length>0) {
          lastLetter = iconLetter
          const tempIcon = getChIcon(iconLetter,level0,level1,iconLetter)
          validIconList.push(tempIcon)
        }
      })
      if (validIconList.length===1) {
        setLevel2(lastLetter)
        setCurLevel(3)
        addSkipLevel(2)
        validIconList = []
        validBookList = []
      }
    }
    if (curLevel===3){
      naviChapters[level1][level2].forEach((bookObj,i) => {
        validIconList.push(getChIcon(i,level0,level1,level2,bookObj))
      })
    } else if (curLevel===4){
      const bookObj = naviChapters[level1][level2][level3]
      const {bk} = bookObj
      if (bk!=null){
        if (bookObj.beg==null) bookObj.beg = 1
        if (bookObj.end==null) bookObj.end = chInBook[bk]
        const {beg,end} = bookObj
        rangeArray(beg,end).forEach(ch => {
          validIconList.push(getChIcon(ch,level0,level1,level2,bookObj,ch))
  //          validIconList.push(getChIcon(index here,...))
        })
      }
    }
  }
  let useCols = 3
  if (size==="xs") useCols = 2
  else if (size==="lg") useCols = 4
  else if (size==="xl") useCols = 5
  return (
    <div>
      {(!isPlaying) && (!pathExists) && (curLevel>2) && (
        <Fab
          onClick={()=>handleOpenSettings()}
          color="grey"
        >
          <Language/>
        </Fab>
      )}
      {(pathExists) && <Typography
          type="title"
          sx={{maxWidth:'500px'}}
        >{pathname}<br/><br/></Typography>}
      {(!isPlaying) && (<ImageList
        rowHeight="auto"
        cols={useCols}
      >
        {validIconList.map(iconObj => {
          const {key,imgSrc,title,subtitle,isBookIcon} = iconObj
          return (
            <ImageListItem
              onClick={(ev) => handleClick(ev,key,isBookIcon)}
              key={key}
            >
              <img
                src={imgSrc}
                alt={title}/>
              <SerieGridBar
                title={title}
                subtitle={subtitle}
              />
            </ImageListItem>
          )
        })}
        </ImageList>
      )}
      {(isPlaying) && (
      <>
        <ImageList
          rowHeight={"auto"}
          sx={{maxWidth:'500px'}}
          cols={1}
        >
          <ImageListItem
            onClick={(ev) => handleClick(ev,"1",false)}
            key="1"
          >
            <img src={syncImgSrc} />
          </ImageListItem>
        </ImageList>
        <Typography
          type="title"
          sx={{maxWidth:'500px'}}
        >{syncVerseText}<br/><br/></Typography>
        <Typography
          type="title"
          sx={{maxWidth:'500px'}}
        >{syncVerseText2}<br/><br/></Typography>
      </>)}
    </div>
  )
}

export default BibleView
