\version "2.26.0"
\header { tagline = ##f }

\score {
  <<
    \new ChordNames \chordmode { g2. | c | d | g }
    \new Staff \new Voice = "m" \relative c'' {
      \key g \major
      \time 3/4
      \tempo "Waltz" 4 = 132
      g4 b d | e4.( d8) c4 | a4 fis d | g2 r4 \bar "|."
    }
    \new Lyrics \lyricsto "m" { Round and round the waltz goes, old and slow. }
  >>
  \layout { indent = 0 }
}
