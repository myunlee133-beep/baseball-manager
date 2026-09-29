import {T as GAPS} from './gaps.mjs';
// 투수: 보직|한글|영문|나이|투(L/R/'')|G|IP|BB|SO|WHIP   (기록 없으면 G부터 비움)
// 타자: 포지션|한글|영문|나이|타(L/R/S/'')|G|PA|AVG|HR|BB|SO|OPS
const TEAMS=[
['KT','KT 위즈','KT 위즈',`
SP|고영표|Ko Young-pyo|35|R|29|161.0|30|154|1.24
SP|소형준|So Hyeong-jun|25|R|26|147.1|29|123|1.25
SP|오원석|Oh Won-seok|25|L|25|132.1|52|113|1.38
SP|배제성|Bae Je-seong|30|R|8|27.0|11|23|1.81
SP|문용익|Moon Yong-ik|31|R|20|28.2|19|31|1.40
RP|우규민|Wu Kyu-min|41|R|53|44.1|3|24|1.08
RP|이상동|Lee Sang-dong|31|R|41|43.1|9|34|0.92
RP|전용주|Jeon Yong-ju|26|L|21|13.2|7|11|1.83
RP|주권|Ju Kwon|31|R|34|40.2|13|19|1.50
RP|김민수|Kim Min-su|34|R|58|52.2|15|36|1.48
RP|원상현|Won Sang-hyun|22|R|52|57.0|35|45|1.60
SU|손동현|Son Dong-hyun|25|R|58|58.2|12|55|1.33
CL|박영현|Park Yeong-hyun|23|R|67|69.0|34|77|1.48`,`
C|장성우|Jang Sung-woo|36|R|129|480|.247|14|55|96|.713
1B|황재균|Hwang Jae-gyun|39|R|112|424|.275|7|34|84|.715
2B|김상수|Kim Sang-su|36|R|113|423|.254|5|52|57|.684
3B|허경민|Heo Gyeong-min|36|R|114|481|.283|4|39|35|.717
SS|장준원|Jang Jun-won|31|R|73|154|.207|1|8|27|.498
LF|김민혁|Kim Min-hyuck|31|L|106|417|.287|0|25|41|.670
CF|최원준|Choi Won-jun|29|L|126|449|.242|6|23|71|.621
RF|안현민|Ahn Hyun-min|23|R|112|482|.334|22|75|72|1.018
DH|김현수|Kim Hyun-soo|38|L`],
['삼성','삼성 라이온즈','삼성 라이온즈',`
SP|원태인|Won Tae-in|26|R|27|166.2|27|108|1.10
SP|최원태|Choi Won-tae|29|R|27|124.1|51|109|1.44
SP|양창섭|Yang Chang-seop|27|R|33|63.0|19|45|1.37
SP|배찬승|Bae Chan-seung|20|L|65|50.2|34|57|1.66
SP|이승현|Lee Seung-hyun|24|L|25|101.1|46|74|1.65
RP|김무신|Kim Mu-sin|27|R
RP|최지광|Choi Ji-gwang|28|R
RP|이승민|Lee Seung-min|26|L
RP|백정현|Baek Jung-hyun|39|L
RP|이재희|Lee Jae-hee|25|R
RP|이재익|Lee Jae-ik|32|L
SU|이호성|Lee Ho-seong|22|R|58|55.1|29|69|1.50
CL|김재윤|Kim Jae-yoon|36|R|63|57.2|13|43|1.21`,`
C|강민호|Kang Min-ho|41|R|127||.269|12|38|69|.753
1B|전병우|Jeon Byeong-woo|34|R|59||.273|1|19|27|.761
2B|류지혁|Ryu Ji-hyeok|32|L|129||.280|1|33|73|.674
3B|김영웅|Kim Young-woong|23|L|125||.249|22|48|143|.778
SS|이재현|Lee Jae-hyun|23|R|139||.254|16|69|119|.787
LF|구자욱|Koo Ja-wook|33|L|142||.319|19|73|91|.918
CF|김성윤|Kim Seong-yoon|27|L|127||.331|6|65|54|.893
RF|박승규|Park Seung-gyu|26|R|64||.287|6|21|43|.797`],
['한화','한화 이글스','한화 이글스',`
SP|류현진|Ryu Hyun-jin|39|L|26|139.1|25|122|1.21
SP|문동주|Moon Dong-ju|23|R|24|121.0|31|135|1.18
SP|엄상백|Eom Sang-baek|30|R|28|80.2|38|74|1.79
SP|김민우|Kim Min-woo|31|R
RP|조동욱|Jo Dong-wook|22|L|68|60.0|29|43|1.77
RP|황준서|Hwang Jun-seo|21|L|23|56.0|26|57|1.43
RP|김종수|Kim Jong-su|32|R|63|63.2|36|59|1.46
RP|정우주|Jung Woo-ju|20|R|51|53.2|21|82|1.02
RP|박상원|Park Sang-won|32|R|74|66.2|21|52|1.32
RP|김범수|Kim Beom-su|31|L|73|48.0|22|41|1.08
SU|한승혁|Han Seung-hyuk|33|R|71|64.0|23|53|1.23
CL|김서현|Kim Seo-hyun|22|R|69|66.0|31|71|1.26`,`
C|최재훈|Choi Jae-hoon|37|R|121|348|.286|1|46|48|.767
1B|채은성|Chae Eun-seong|36|R|132|527|.288|19|31|96|.814
2B|하주석|Ha Ju-suk|32|L|95|305|.297|4|12|66|.728
3B|노시환|Roh Si-hwan|26|R|144|624|.260|32|70|125|.851
SS|심우준|Sim Woo-jun|31|R|94|275|.231|2|17|49|.587
LF|문현빈|Moon Hyun-bin|22|L|141|592|.320|12|38|82|.823
CF|이원석|Lee Won-seok|27|R|129|248|.203|4|23|51|.582
RF|강백호|Kang Baek-ho|27|L
DH|손아섭|Son Ah-seop|38|L|111|416|.288|1|37|59|.723`],
['SSG','SSG 랜더스','SSG 랜더스',`
SP|김광현|Kim Kwang-hyun|38|L|28|144.0|50|138|1.49
SP|김건우|Kim Geon-woo|24|L|35|66.0|49|68|1.55
SP|문승원|Moon Seung-won|37|R|23|105.1|38|61|1.40
SP|송영진|Song Young-jin|22|R|21|63.1|31|40|1.71
SP|최민준|Choi Min-jun|27|R|40|65.2|24|44|1.46
RP|이로운|Lee Ro-un|22|R|75|77.0|26|66|1.06
RP|김민|Kim Min|27|R|70|63.2|17|65|1.21
RP|박시후|Park Si-hoo|24|L|52|52.1|29|34|1.41
RP|전영준|Jeon Young-jun|24|R|34|52.2|26|55|1.41
RP|김택형|Kim Taek-hyung|30|L|25|22.2|10|14|1.28
RP|한두솔|Han Doo-sol|29|L|44|36.1|19|27|1.79
SU|노경은|No Kyung-eun|42|R|77|80.0|25|68|1.06
CL|조병현|Jo Byeong-hyeon|24|R|69|67.1|18|79|0.89`,`
C|조형우|Jo Hyeong-woo|24|R|102|294|.238|4|19|64|.606
1B|고명준|Ko Myeong-jun|24|R|130|500|.278|17|20|99|.739
2B|정준재|Jung Jun-jae|23|L|132|442|.245|0|51|93|.628
3B|최정|Choi Jeong|39|R|95|406|.244|23|51|94|.842
SS|박성한|Park Seong-han|28|L|127|538|.274|7|79|93|.765
CF|최지훈|Choi Ji-hoon|29|L|140|574|.284|7|43|87|.713
RF|한유섬|Han Yoo-seom|37|L|128|511|.273|15|46|120|.771
LF|오태곤|Oh Tae-gon|35|R|122|229|.201|5|30|59|.619
DH|류효승|Ryu Hyo-seung|30|R|27|103|.287|6|7|28|.882`],
['키움','키움 히어로즈','키움 히어로즈',`
SP|하영민|Ha Young-min|31|R|28|153.1|41|134|1.37
SP|정현우|Jung Hyun-woo|20|L|18|81.1|48|55|1.72
SP|김윤하|Kim Yoon-ha|21|R|19|88.0|44|52|1.78
SP|박정훈|Park Jung-hoon|21||16|23.0|20|7|1.91
SP|안우진|An Woo-jin|27|R
RP|원종현|Won Jong-hyun|39|R|61|54.1|18|40|1.58
RP|박윤성|Park Yoon-sung|22|R|54|51.2|19|40|1.43
RP|오석주|Oh Seok-ju|28|R|53|58.1|29|44|1.39
RP|김선기|Kim Seon-gi|35|R|44|78.0|47|43|1.83
RP|윤석원|Yoon Seok-won|23|L|37|37.1|12|27|1.42
RP|이준우|Lee Jun-woo|24||31|23.0|12|22|2.13
SU|조영건|Jo Young-gun|27|R|51|77.2|38|47|1.57
CL|주승우|Ju Seung-woo|26|R|42|44.0|17|35|1.18`,`
C|김건희|Kim Geon-hee|24|R|105|344|.242|3|13|102|.615
1B|최주환|Choi Joo-hwan|38|L|120|506|.275|12|36|66|.755
2B|김태진|Kim Tae-jin|31|L|94|304|.233|5|20|53|.622
3B|송성문|Song Sung-moon|30|L|144|646|.315|26|68|96|.917
SS|어준서|Eo Jun-seo|22||116|360|.238|6|30|75|.632
LF|임지열|Im Ji-yeol|31|R|102|417|.244|11|42|111|.704
CF|이주형|Lee Ju-hyung|25|L|127|514|.240|11|37|115|.705
RF|박주홍|Park Ju-hong|25|L|102|283|.226|3|30|72|.641
DH|주성원|Ju Seong-won|26||58|174|.250|1|13|45|.630`],
['NC','NC 다이노스','NC 다이노스',`
SP|신민혁|Shin Min-hyeok|27|R|28|132.0|26|84|1.32
SP|구창모|Koo Chang-mo|29|L|4|14.1|3|18|1.19
SP|김녹원|Kim Nok-won|23|R|21|70.0|47|37|1.74
SP|목지훈|Mok Ji-hoon|22|R|16|58.0|42|45|1.90
SP|이재학|Lee Jae-hak|36|R
RP|김영규|Kim Young-kyu|26|L|45|44.0|18|35|1.32
RP|배재환|Bae Jae-hwan|31|R|70|60.1|37|51|1.41
RP|손주환|Son Ju-hwan|24|R|52|51.2|19|37|1.39
RP|전사민|Jeon Sa-min|27|R|74|82.1|33|62|1.45
RP|하준영|Ha Jun-young|27|L|10|5.1|7|5|3.19
RP|김재열|Kim Jae-yeol|30|R|22|21.2|16|16|2.22
SU|김진호|Kim Jin-ho|28|R|76|72.1|45|70|1.35
CL|류진욱|Ryu Jin-wook|29|R|62|66.0|28|57|1.18`,`
C|김형준|Kim Hyung-jun|27|R|127|415|.232|18|45|126|.734
1B|오영수|Oh Young-soo|26|L|67|179|.232|3|22|47|.658
2B|박민우|Park Min-woo|33|L|117|468|.302|3|44|64|.810
3B|김휘집|Kim Hui-jip|24|R|142|500|.249|17|40|89|.769
SS|김주원|Kim Ju-won|24|S|144|624|.289|15|63|111|.830
LF|권희동|Kwon Hui-dong|35|R|136|456|.246|6|77|80|.756
CF|박시원|Park Si-won|24||52|60|.204|1|5|18|.567
RF|박건우|Park Kun-woo|36|R|124|442|.289|9|47|63|.797`],
['LG','LG 트윈스','LG 트윈스',`
SP|임찬규|Im Chan-kyu|34|R|27|160.1|40|107|1.27
SP|손주영|Son Ju-young|27|L|30|153.0|49|132|1.32
SP|송승기|Song Seung-gi|24|L|28|144.0|49|125|1.38
SP|이민호|Lee Min-ho|25|R
SP|김윤식|Kim Yun-sik|26|L
RP|김영우|Kim Young-woo|21|R|66|60.0|30|56|1.32
RP|함덕주|Ham Deok-ju|31|L|31|27.0|18|26|1.19
RP|이정용|Lee Jung-yong|29|R|39|34.0|12|26|1.29
RP|장현식|Jang Hyun-sik|31|R|56|49.2|21|38|1.73
RP|박명근|Park Myeong-geun|22|R|44|38.2|16|30|1.34
RP|이지강|Lee Ji-kang|27|R|43|47.1|24|39|1.56
SU|김진성|Kim Jin-sung|41|R|78|70.2|24|63|1.20
CL|유영찬|Yoo Young-chan|29|R|39|41.0|23|52|1.32`,`
C|박동원|Park Dong-won|36|R|139|523|.253|22|62|124|.797
1B|송찬의|Song Chan-eui|27|R|66|166|.211|3|9|49|.638
2B|신민재|Shin Min-jae|30|L|135|538|.313|1|62|57|.777
3B|문보경|Moon Bo-gyeong|26|L|141|607|.276|24|79|108|.831
SS|오지환|Oh Ji-hwan|36|L|127|472|.253|16|37|115|.744
LF|문성주|Moon Seong-ju|29|L|135|542|.305|3|54|59|.750
CF|박해민|Park Hae-min|36|L|144|544|.276|3|68|94|.725
RF|홍창기|Hong Chang-ki|33|L|51|215|.287|1|29|40|.727`],
['롯데','롯데 자이언츠','롯데 자이언츠',`
SP|박세웅|Park Se-woong|32|R|29|160.2|54|156|1.48
SP|나균안|Na Gyun-an|29|R|28|137.1|50|116|1.41
SP|이민석|Lee Min-seok|24|R|20|87.1|56|61|1.83
SP|홍민기|Hong Min-gi|22|L|25|32.0|11|39|1.09
SP|김진욱|Kim Jin-wook|25|L|14|27.0|16|24|2.15
RP|김강현|Kim Kang-hyun|32|R|67|72.0|21|36|1.25
RP|박진|Park Jin|28|R|51|69.1|22|50|1.41
RP|최준용|Choi Jun-yong|26|R|49|54.1|16|62|1.21
RP|정현수|Jung Hyun-su|26|L|82|47.2|26|47|1.26
RP|윤성빈|Yoon Seong-bin|28|R|31|27.0|20|44|1.70
RP|박준우|Park Jun-woo|22||11|12.1|6|11|2.19
SU|정철원|Jung Cheol-won|28|R|75|70.0|28|55|1.43
CL|김원중|Kim Won-jung|34|R|53|60.2|33|69|1.50`,`
C|유강남|Yu Kang-nam|35|R|110|350|.274|5|26|66|.735
1B|나승엽|Na Seung-yeop|25|L|105|392|.229|9|55|65|.707
2B|고승민|Ko Seung-min|27|L|121|538|.271|4|56|83|.700
3B|한동희|Han Dong-hee|28|R
SS|전민재|Jeon Min-jae|28|R|101|369|.287|5|22|63|.715
LF|황성빈|Hwang Seong-bin|30|L|79|273|.256|1|18|46|.632
CF|장두성|Jang Du-seong|28||118|284|.262|0|24|64|.630
RF|윤동희|Yoon Dong-hee|24|R|97|399|.282|9|49|65|.819
DH|전준우|Jeon Jun-woo|41|R|114|472|.293|8|44|71|.789`],
['두산','두산 베어스','두산 베어스',`
SP|곽빈|Gwak Been|27|R|19|109.1|41|107|1.25
SP|최승용|Choi Seung-yong|25|L|23|116.1|36|71|1.35
SP|최민석|Choi Min-seok|20|R|17|77.2|34|53|1.36
SP|윤태호|Yoon Tae-ho|23|R|10|17.1|5|16|1.21
SP|최준호|Choi Jun-ho|22|R|9|16.0|9|11|1.69
RP|이영하|Lee Young-ha|29|R|73|66.2|39|72|1.53
RP|박신지|Park Sin-ji|27|R|54|60.0|29|36|1.40
RP|이병헌|Lee Byeong-heon|23|L|22|13.0|10|9|1.62
RP|최지강|Choi Ji-gang|25|R|39|32.2|13|38|1.65
RP|양재훈|Yang Jae-hoon|27|R|19|23.1|8|19|1.16
RP|최원준|Choi Won-jun|32|R|47|107.0|38|62|1.34
SU|박치국|Park Chi-guk|28|R|73|62.1|21|57|1.27
CL|김택연|Kim Taek-yeon|21|R|64|66.1|31|79|1.18`,`
C|양의지|Yang Eui-ji|39|R|130|517|.337|20|50|63|.939
1B|양석환|Yang Suk-hwan|35|R|72|294|.248|8|24|82|.721
2B|박준순|Park Jun-sun|19|R|91|298|.284|4|10|56|.686
3B|안재석|Ahn Jae-seok|24|L|35|147|.319|4|11|27|.911
SS|박찬호|Park Chan-ho|31|R
LF|김인태|Kim In-tae|32|L|106|225|.213|3|36|57|.684
CF|정수빈|Jung Soo-bin|36|L|132|546|.258|6|61|57|.703
RF|김대한|Kim Dae-han|26|R|16|37|.194|1|1|6|.494
DH|김재환|Kim Jae-hwan|38|L|103|407|.241|13|57|96|.758`],
['KIA','KIA 타이거즈','KIA 타이거즈',`
SP|양현종|Yang Hyeon-jong|37|L|30|153.0|57|109|1.49
SP|이의리|Lee Eui-lee|24|L|10|39.2|31|42|1.82
SP|김도현|Kim Do-hyun|26|R|24|125.1|33|71|1.45
SP|김태형|Kim Tae-hyung|20|R|8|23.2|7|14|1.35
SP|황동하|Hwang Dong-ha|24|R|18|35.2|10|31|1.35
RP|김기훈|Kim Gi-hoon|26|L|24|27.2|10|27|1.27
RP|성영탁|Seong Young-tak|22|R|45|52.1|13|30|0.97
RP|한재승|Han Jae-seung|25|R|36|33.1|31|35|2.13
RP|최지민|Choi Ji-min|23|L|66|53.1|51|39|1.82
RP|조상우|Cho Sang-woo|32|R|72|60.0|27|55|1.52
RP|이준영|Lee Jun-young|34|L|57|34.0|11|34|1.38
SU|전상현|Jeon Sang-hyun|30|R|74|70.0|20|50|1.20
CL|정해영|Jung Hae-young|25|R|60|61.2|18|72|1.51`,`
C|한준수|Han Jun-su|27|L|103|276|.225|7|26|48|.673
1B|오선우|Oh Seon-woo|30|L|124|474|.265|18|34|158|.755
2B|김선빈|Kim Sun-bin|37|R|84|308|.321|3|31|35|.823
3B|윤도현|Yoon Do-hyun|23|R|40|160|.275|6|8|36|.786
SS|김도영|Kim Do-young|23|R|30|122|.309|7|10|23|1.000
LF|김석환|Kim Seok-hwan|27|L|47|134|.265|2|14|55|.710
CF|김호령|Kim Ho-ryeong|34|R|105|381|.283|6|34|94|.793
RF|나성범|Na Sung-bum|37|L|82|310|.268|10|42|79|.825
DH|최형우|Choi Hyoung-woo|43|L|133|549|.307|24|67|98|.928`],
];
const LONG={KT:'KT 위즈',삼성:'삼성 라이온즈',한화:'한화 이글스',SSG:'SSG 랜더스',키움:'키움 히어로즈',NC:'NC 다이노스',LG:'LG 트윈스',롯데:'롯데 자이언츠',두산:'두산 베어스',KIA:'KIA 타이거즈'};

// ── 개별 추정/조정 (팀:이름). 타자 c e p s d, 투수 v st ct sm ──
const EST={ // 기록 없음 또는 벤치·2군 개별 추정: 전 능력치
'KT:김현수':{c:62,e:65,p:50,s:35,d:40},'한화:강백호':{c:60,e:58,p:62,s:40,d:35},'롯데:한동희':{c:52,e:50,p:60,s:38,d:45},'두산:박찬호':{c:55,e:48,p:32,s:65,d:65},
'키움:안우진':{v:78,st:72,ct:55,sm:65},'한화:김민우':{v:50,st:50,ct:45,sm:55},'NC:이재학':{v:38,st:50,ct:50,sm:50},'LG:이민호':{v:58,st:50,ct:42,sm:52},'LG:김윤식':{v:45,st:50,ct:55,sm:52},
'삼성:김무신':{v:65,st:55,ct:38,sm:35},'삼성:최지광':{v:55,st:52,ct:45,sm:35},'삼성:이승민':{v:42,st:45,ct:48,sm:40},'삼성:백정현':{v:38,st:45,ct:55,sm:45},'삼성:이재희':{v:55,st:48,ct:42,sm:45},'삼성:이재익':{v:42,st:45,ct:45,sm:30},
'삼성:김지찬':{c:58,e:55,p:30,s:72,d:52},'두산:강승호':{c:48,e:40,p:50,s:52,d:50},'NC:서호철':{c:52,e:42,p:42,s:45,d:50},'KT:배정대':{c:47,e:48,p:40,s:52,d:58},'LG:이재원':{c:40,e:42,p:62,s:40,d:40},
'KIA:김태군':{c:45,e:40,p:35,s:25,d:58},'NC:박세혁':{c:44,e:50,p:38,s:28,d:52},'키움:이용규':{c:50,e:58,p:22,s:38,d:42},'두산:조수행':{c:40,e:42,p:25,s:72,d:55},'KIA:황대인':{c:42,e:40,p:52,s:30,d:38},
'삼성:임기영':{v:40,st:50,ct:55,sm:50},'LG:정우영':{v:55,st:55,ct:40,sm:35},'롯데:한현희':{v:45,st:48,ct:45,sm:45},'롯데:구승민':{v:45,st:52,ct:42,sm:32},'롯데:김상수':{v:38,st:45,ct:48,sm:30},
'한화:주현상':{v:45,st:50,ct:55,sm:33},'한화:강재민':{v:45,st:52,ct:48,sm:33},'SSG:서진용':{v:50,st:55,ct:40,sm:32},'SSG:박종훈':{v:30,st:52,ct:38,sm:50},'LG:최채흥':{v:40,st:45,ct:48,sm:50},
};
const ADJ={ // Q11-A: 원문에 없는 능력치만 조정 (스피드·수비·구속), 소표본 보정 포함
'KIA:김도영':{c:65,e:55,p:68,s:70,d:52,note:'소표본(122타석)이라 개별 지정'},'NC:구창모':{v:55,st:62,ct:55,sm:50,note:'소표본(14.1이닝)이라 개별 지정'},
'LG:박해민':{s:70,d:68},'두산:정수빈':{s:62,d:65},'SSG:최지훈':{s:62,d:60},'삼성:김성윤':{s:62,d:55},'롯데:황성빈':{s:68,d:48},'LG:신민재':{s:62,d:52},
'SSG:박성한':{s:50,d:60},'NC:김주원':{s:58,d:58},'KIA:김호령':{s:58,d:66},'한화:심우준':{s:60,d:58},'삼성:이재현':{s:48,d:60},'LG:오지환':{s:45,d:60},'KT:최원준':{s:58,d:50},
'두산:양의지':{s:28,d:60},'삼성:강민호':{s:25,d:50},'KIA:최형우':{s:28},'두산:김재환':{s:35},'SSG:최정':{s:35,d:48},'한화:채은성':{s:35,d:42},'LG:박동원':{s:30,d:55},
'KT:장성우':{s:28,d:52},'롯데:전준우':{s:35},'KT:황재균':{s:35,d:45},'KT:허경민':{s:40,d:58},'SSG:한유섬':{s:35,d:42},'KIA:나성범':{s:40,d:45},'KIA:김선빈':{s:40,d:52},
'한화:최재훈':{s:28,d:55},'롯데:유강남':{s:28,d:50},'NC:김형준':{s:30,d:55},'한화:손아섭':{s:40},
'한화:문동주':{v:78},'한화:김서현':{v:76},'한화:정우주':{v:74},'SSG:조병현':{v:62},'KT:박영현':{v:64},'두산:김택연':{v:66},'삼성:배찬승':{v:68},'KIA:이의리':{v:64},
'KT:원상현':{v:60},'SSG:이로운':{v:60},'한화:한승혁':{v:64},'KIA:조상우':{v:58},'KIA:정해영':{v:58},'LG:유영찬':{v:64},'LG:김영우':{v:64},'LG:손주영':{v:60},
'두산:곽빈':{v:66},'롯데:이민석':{v:64},'롯데:윤성빈':{v:68},'롯데:최준용':{v:60},'삼성:이호성':{v:62},'LG:김진성':{v:48},'SSG:노경은':{v:50},
'KT:고영표':{v:38},'한화:류현진':{v:45},'KT:우규민':{v:35},'LG:임찬규':{v:42},'NC:신민혁':{v:44},'SSG:김광현':{v:50},'KIA:양현종':{v:45},'두산:최원준':{v:42},'SSG:문승원':{v:50},
};
const HAND={ // 벤치·2군 중 아는 선수의 좌우
'KT:강현우':'R','KT:문상철':'R','KT:장진혁':'L','KT:배정대':'R','KT:오윤석':'R','삼성:김지찬':'L','삼성:김헌곤':'R','삼성:김도환':'R','삼성:김재성':'L','삼성:이성규':'R',
'한화:김태연':'R','한화:이진영':'R','한화:허인서':'R','한화:최인호':'L','한화:황영묵':'L','한화:이도윤':'L','SSG:이지영':'R','SSG:박지환':'R','SSG:안상현':'R','SSG:전의산':'L','SSG:최준우':'L','SSG:김성욱':'R','SSG:김민식':'L','SSG:하재훈':'R',
'키움:김동헌':'R','키움:박수종':'R','키움:오선진':'R','키움:이형종':'R','키움:임병욱':'L','키움:이용규':'L','NC:박세혁':'L','NC:서호철':'R','NC:천재환':'R','NC:이우성':'R','NC:최정원':'L',
'LG:구본혁':'R','LG:이재원':'R','LG:이영빈':'L','LG:천성호':'L','LG:이주헌':'R','롯데:손성빈':'R','롯데:손호영':'R','롯데:김민성':'R','롯데:노진혁':'L','롯데:정훈':'R',
'두산:김기연':'R','두산:강승호':'R','두산:조수행':'L','두산:김민석':'L','두산:박지훈':'R','KIA:김태군':'R','KIA:김규성':'L','KIA:박민':'R','KIA:박정우':'L','KIA:이창진':'R','KIA:변우혁':'R','KIA:고종욱':'L','KIA:황대인':'R',
'삼성:임기영':'R','LG:정우영':'R','롯데:한현희':'R','롯데:구승민':'R','롯데:김상수':'R','한화:주현상':'R','한화:강재민':'R','SSG:서진용':'R','SSG:박종훈':'R','LG:최채흥':'L',
'NC:임정호':'L','KIA:김대유':'L','롯데:심재민':'L','LG:백승현':'R','KIA:김건국':'R','KT:최동환':'R','한화:권민규':'L','NC:최성영':'L',
};
// 포텐: 사용자 지정
let seed=20260329;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const POT={'KIA:김도영':80,'KT:안현민':76,'NC:김주원':75,'한화:문현빈':72,'KT:박영현':72,'KIA:이의리':70,'SSG:이로운':68,'한화:오재원':68,'KIA:윤도현':66,'두산:안재석':64};
for(const k of ['한화:문동주','한화:정우주','두산:김택연','삼성:배찬승','한화:김서현','SSG:조병현','삼성:김영웅','삼성:이재현','KT:소형준','키움:정현우','두산:박준순'])POT[k]=60+Math.floor(rnd()*10);

const clamp=v=>Math.max(20,Math.min(80,Math.round(v)));
const ip=s=>{const [a,b='0']=String(s).split('.');return +a+(+b)/3;};
const hash=s=>{let h=2166136261;for(const ch of s){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;};
const players=[];
for(const [code,,name,pt,bt] of TEAMS){
  for(const l of pt.trim().split('\n')){const [role,ko,en,age,t,G,IP,BB,SO,WHIP]=l.split('|');players.push({code,grp:'1군',kind:'P',role,ko,en,age:+age,hand:t||'',hs:t?'':'?',st:G?{G:+G,IP:ip(IP),BB:+BB,SO:+SO,WHIP:+WHIP}:null});}
  for(const l of bt.trim().split('\n')){const [pos,ko,en,age,b,G,PA,AVG,HR,BB,SO,OPS]=l.split('|');players.push({code,grp:'1군',kind:'B',role:'주전',pos,ko,en,age:+age,hand:b||'',hs:b?'':'?',st:G?{G:+G,PA:PA?+PA:Math.round(G*3.9),paEst:!PA,AVG:+AVG,HR:+HR,BB:+BB,SO:+SO,OPS:+OPS}:null});}
  const g=GAPS[LONG[code]];
  const src=v=>v==='e'?'*':v==='u'?'?':'';
  for(const [arr,grp,role] of [[g.bench,'1군','벤치'],[g.b2,'2군','2군']])for(const s of arr){const [en,ko,age,as,pos,ps]=s.split('|');const h=HAND[`${code}:${ko}`];players.push({code,grp,kind:'B',role,pos,ko,en,age:+age,ageSrc:src(as),posSrc:src(ps),hand:h||'',hs:h?'':'?',st:null});}
  for(const s of g.p2){const [en,ko,age]=s.split('|');const h=HAND[`${code}:${ko}`];players.push({code,grp:'2군',kind:'P',role:'2군',ko,en,age:+age,hand:h||'',hs:h?'':'?',st:null});}
}
if(players.find(p=>p.code==='두산'&&p.ko==='박찬호'))players.find(p=>p.code==='두산'&&p.ko==='박찬호').ageSrc='*';
players.find(p=>p.code==='두산'&&p.ko==='최민석').ageSrc='*';

// ── 풀 통계 (타자 150타석+, 투수 40이닝+) ──
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};
const hm=p=>{const s=p.st,ab=s.PA-s.BB-Math.round(s.PA*.02),h=s.AVG*ab,obp=(h+s.BB)/(ab+s.BB),slg=s.OPS-obp;return {avg:s.AVG,k:s.SO/s.PA,bb:s.BB/s.PA,iso:slg-s.AVG,hr:s.HR/s.PA};};
const pm=p=>{const s=p.st;return {k9:s.SO*9/s.IP,bb9:s.BB*9/s.IP,h9:Math.max(0,s.WHIP*s.IP-s.BB)*9/s.IP};};
const H=players.filter(p=>p.kind==='B'&&p.st&&p.st.PA>=150).map(hm),P=players.filter(p=>p.kind==='P'&&p.st&&p.st.IP>=40).map(pm);
const Z=(arr,k)=>{const m=mean(arr.map(x=>x[k])),d=sd(arr.map(x=>x[k]));return v=>(v-m)/d;};
const zh={avg:Z(H,'avg'),k:Z(H,'k'),bb:Z(H,'bb'),iso:Z(H,'iso'),hr:Z(H,'hr')},zp={k9:Z(P,'k9'),bb9:Z(P,'bb9'),h9:Z(P,'h9')};
const comp=(arr,f)=>{const s=sd(arr.map(f));return x=>f(x)/s;};
const cC=comp(H,x=>.6*zh.avg(x.avg)-.4*zh.k(x.k)),cP=comp(H,x=>.5*zh.iso(x.iso)+.5*zh.hr(x.hr)),cS=comp(P,x=>.65*zp.k9(x.k9)-.35*zp.h9(x.h9));
const SPD={C:[35,52],'1B':[40,42],'2B':[50,52],'3B':[45,50],SS:[54,56],LF:[48,46],CF:[56,56],RF:[48,48],DH:[40,35],IF:[48,50],OF:[50,48]};

for(const p of players){
  const k=`${p.code}:${p.ko}`,est=EST[k],adj=ADJ[k];p.notes=[];
  if(p.kind==='B'){
    let r;
    if(p.st){
      const m=hm(p),w=p.st.PA/(p.st.PA+200),def=p.role==='주전'?48:45,mix=v=>w*v+(1-w)*def;
      const [s0,d0]=SPD[p.pos]||SPD.IF;let s=s0,d=d0;if(p.age>=32)s-=3;if(p.age>=36)s-=3;if(p.age>=34)d-=2;if(p.age>=37)d-=2;
      r={c:mix(50+10*cC(m)),e:mix(50+10*zh.bb(m.bb)),p:mix(50+10*cP(m)),s,d};p.src='기록';
      if(p.st.PA<150&&!adj?.note)p.notes.push(`소표본 ${p.st.PA}타석`);if(p.st.paEst)p.notes.push('타석 추정');
    }else if(est){r={...est};p.src='개별';}
    else{const base=p.role==='벤치'?45:40;r={c:base,e:base,p:base-3,s:base,d:base+3};const pos=p.pos;
      if(pos==='C'){r.s-=10;r.d+=2;}if(pos==='1B'){r.p+=4;r.s-=5;r.d-=5;}if(['SS','CF'].includes(pos)){r.s+=4;r.d+=3;r.p-=3;}
      if(p.age<=21)for(const x in r)r[x]-=3;else if(p.age<=24)for(const x in r)r[x]-=1;
      if(p.age>=32)r.s-=3;if(p.age>=36){r.s-=3;r.p-=2;r.c+=2;r.e+=2;}p.src='기본';}
    if(est&&p.st){Object.assign(r,est);p.src='개별';}
    if(adj){for(const x of 'cepsd')if(adj[x]!=null)r[x]=adj[x];if(adj.note){p.src='개별';p.notes.push(adj.note);}else p.notes.push('스피드·수비 조정');}
    for(const x in r)r[x]=clamp(r[x]);p.r=r;
  }else{
    let r;const rp=!['SP'].includes(p.role)&&p.role!=='2군';
    if(p.st){
      const m=pm(p),w=p.st.IP/(p.st.IP+60),def=p.role==='SP'?47:46,mix=v=>w*v+(1-w)*def;
      const st=mix(50+10*cS(m)),ct=mix(50-10*zp.bb9(m.bb9));
      let v=47+.4*(st-50)+(['CL','SU'].includes(p.role)?3:0);if(p.age<=23)v+=2;if(p.age>=34)v-=4;if(p.age>=38)v-=4;
      const ipg=p.st.IP/p.st.G,sm=ipg>=3.5?Math.max(40,Math.min(65,40+ipg*3)):Math.max(25,Math.min(40,25+ipg*6));
      r={v,st,ct,sm};p.src='기록';if(p.st.IP<30&&!adj?.note)p.notes.push(`소표본 ${Math.round(p.st.IP*10)/10}이닝`);
      p.isRP=ipg<3.5;
    }else if(est){r={...est};p.src='개별';p.isRP=p.role!=='SP'&&est.sm<45;}
    else{r={v:43,st:40,ct:40,sm:38};if(p.age<=21){r.v+=2;r.ct-=3;}if(p.age>=34){r.v-=4;r.ct+=3;}if(p.age>=38){r.v-=3;r.sm-=3;}p.src='기본';p.isRP=true;}
    if(adj){for(const x of ['v','st','ct','sm'])if(adj[x]!=null)r[x]=adj[x];if(adj.note){p.src='개별';p.notes.push(adj.note);}else p.notes.push('구속 조정');}
    for(const x in r)r[x]=clamp(r[x]);p.r=r;
  }
}
// ── OVR: 가중 평균 → 2026 개막 1군 기준 평균 50·표준편차 8로 확대 (기준값은 고정 상수로 저장) ──
const W={B:{c:.3,e:.2,p:.3,s:.1,d:.1},Bp:{c:.27,e:.18,p:.25,s:.1,d:.2},DH:{c:.35,e:.25,p:.4},SP:{v:.2,st:.35,ct:.3,sm:.15},RP:{v:.25,st:.45,ct:.3}};
const wm=p=>{const w=p.kind==='B'?(p.pos==='DH'?W.DH:['C','SS','CF'].includes(p.pos)?W.Bp:W.B):(p.isRP?W.RP:W.SP);return Object.entries(w).reduce((s,[k,x])=>s+x*p.r[k],0)-(p.kind==='P'&&p.isRP?3:0);};
const one=players.filter(p=>p.grp==='1군').map(wm);export const OVR_BASE={mean:mean(one),sd:sd(one)};
const POT2={'한화:문동주':3,'한화:정우주':3,'한화:김서현':3};
for(const p of players){
  const k=`${p.code}:${p.ko}`;
  p.ovr=Math.max(20,Math.min(80,Math.round(50+8*(wm(p)-OVR_BASE.mean)/OVR_BASE.sd)));
  const room=p.age<=20?25:({21:22,22:18,23:14,24:11,25:7,26:4})[p.age]??0;
  const dev=Math.round(hash(k)*14-7);
  if(POT2[k]!=null){p.pot=Math.min(80,p.ovr+POT2[k]);p.potSrc='지정(OVR+3)';}
  else if(POT[k]!=null){p.pot=Math.max(p.ovr,POT[k]);p.potSrc=POT[k]<p.ovr?`지정 ${POT[k]}→OVR로 올림`:'지정';}
  else p.pot=Math.max(p.ovr,Math.min(80,p.ovr+(room?room+dev:0)));
}
export {players};
if(import.meta.url===`file://${process.argv[1]}`){
  const fmt=p=>p.kind==='B'?`${p.r.c}/${p.r.e}/${p.r.p}/${p.r.s}/${p.r.d}`:`${p.r.v}/${p.r.st}/${p.r.ct}/${p.r.sm}`;
  const posOf=p=>p.kind==='B'?p.pos+(p.posSrc||''):(p.role==='2군'?'P':p.role);
  let out='';
  for(const [code,,name] of TEAMS){
    const ps=players.filter(p=>p.code===code);
    out+=`\n## ${name} (${ps.length}명 · 1군 ${ps.filter(p=>p.grp==='1군').length})\n`;
    for(const [title,f,cols] of [['1군 투수',p=>p.grp==='1군'&&p.kind==='P','구속/구위/제구/체력'],['1군 타자',p=>p.grp==='1군'&&p.kind==='B','컨택/선구/파워/스피드/수비'],['2군 투수',p=>p.grp==='2군'&&p.kind==='P','구속/구위/제구/체력'],['2군 타자',p=>p.grp==='2군'&&p.kind==='B','컨택/선구/파워/스피드/수비']]){
      out+=`\n### ${title}\n\n| 이름 | 나이 | 포지션 | 좌우 | ${cols} | OVR | POT | 출처 | 비고 |\n|---|---|---|---|---|---|---|---|---|\n`;
      for(const p of ps.filter(f))out+=`| ${p.ko} | ${p.age}${p.ageSrc||''} | ${posOf(p)} | ${p.hand||'?'} | ${fmt(p)} | ${p.ovr} | **${p.pot}** | ${p.src} | ${[p.potSrc?`포텐 ${p.potSrc}`:'',...p.notes].filter(Boolean).join(', ')} |\n`;
    }
  }
  process.stdout.write(out);
  const all=players;const st=(a,f)=>{const v=a.map(f);return `평균 ${mean(v).toFixed(1)} · 표준편차 ${sd(v).toFixed(1)} · ${Math.min(...v)}~${Math.max(...v)}`;};
  console.error('총',all.length,'1군',all.filter(p=>p.grp==='1군').length);
  const reg=all.filter(p=>p.kind==='B'&&p.role==='주전');for(const k of 'cepsd')console.error('주전타자',k,st(reg,p=>p.r[k]));
  const sp=all.filter(p=>p.kind==='P'&&p.grp==='1군');for(const k of ['v','st','ct','sm'])console.error('1군투수',k,st(sp,p=>p.r[k]));
  console.error('OVR 1군',st(all.filter(p=>p.grp==='1군'),p=>p.ovr),'2군',st(all.filter(p=>p.grp==='2군'),p=>p.ovr));
  console.error('POT 지정',JSON.stringify(Object.fromEntries(Object.entries(POT))));
  console.error('좌우 미상',all.filter(p=>!p.hand).length);
}
