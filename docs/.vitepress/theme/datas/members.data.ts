const members = [
    {
      avatar: "/github/AW-CRK14.png",
      name: "AW-CRK14",
      title: "发起者",
      links: [{ icon: "github", link: "https://github.com/AW-CRK14" }],
    },
    {
      avatar: "/github/kitUIN.png",
      name: "kitUIN",
      title: "贡献者/前端",
      links: [{ icon: "github", link: "https://github.com/kitUIN" }],
    },
    {
      avatar: '/github/AnECanSaiTin.png',
      name: 'AnECanSaiTin',
      title: '贡献者',
      links: [
        { icon: 'github', link: 'https://github.com/AnECanSaiTin' },
      ]
    },
    {
        avatar: '/github/IAFEnvoy.jpg',
        name: 'IAFEnvoy',
        title: '贡献者',
        links: [
            { icon: 'github', link: 'https://github.com/IAFEnvoy' },
        ]
    },
    {
        avatar: '/github/HehCrashes.jpg',
        name: 'HehCrashes',
        title: '贡献者',
        links: [
            { icon: 'github', link: 'https://github.com/HehCrashes' },
        ]
    }
  ];
export default {
  load() {
    return {
      members: members
    }
  }
}
