export default function Character({color = '#ca7e60', delay = '0s'}) {
  return <span className="guide-character" style={{'--character-color':color,'--character-delay':delay}} aria-hidden="true"><span className="character-body"><i/><i/></span><span className="character-feet"/></span>;
}
