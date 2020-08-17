const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Portfolio = require('../schemas/portfolio');
const Student = require('../schemas/student');
const { verifyToken } = require("./middlewares/authorization");
const { findWriter } = require("./middlewares/findWriter");
const { adminConfirmation } = require('./middlewares/adminConfirmation');
const { formatDateSend } = require('../js/formatDateSend');
const imageUploader = require('./controllers/image.controller').imageUpload;
const imagesCleaner = require('./controllers/image.controller').imagesClean;

router.use(express.static('images/portfolios'));

router.get('/list', (req, res) => {
    Portfolio.find({}, { _id: true, projectTitle: true, writer: true, date: true, projectTeamName: true, view: true }).sort({ _id: -1 })
        .then((portfolioList) => {
            res.json({ status: "success", count: portfolioList.length, portfolioList: portfolioList });
        })
        .catch(err => {
            console.log(err);
            res.status(500).json({ status: "error" })
        })
})

router.get("/list/:page", (req, res) => {
    const page = req.params.page;
    Portfolio.find({}).count()
        .then((count) => {
            Portfolio.find({}, { _id: true, projectTitle: true, contents: true, date: true, projectTeamName: true, projectImages: true })
                .sort({ _id: -1 })
                .skip((page - 1) * 10)
                .limit(10)
                .then((portfolios) => {
                    res.json({ status: "success", count: count, projectList: portfolios });
                })
                .catch((err) => {
                    console.log(err);
                    res.status(500).json({ status: 'error' });
                });
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ status: "error" });
        })
});

router.get('/:portfolioId', (req, res) => {
    const _id = mongoose.Types.ObjectId(req.params.portfolioId);
    Portfolio.update({ _id: _id }, { $inc: { view: 1 } }, { new: true }).exec()
        .then(() => {
            Portfolio.aggregate([
                { $match: { _id: _id } },
                {
                    $lookup:
                    {
                        from: "student",
                        localField: "students",
                        foreignField: "_id",
                        as: "studentInfo"
                    }
                },
                { $project: { "studentInfo.pw": 0, "studentInfo.name": 0, "studentInfo.phoneNum": 0 } }
            ])
                .then((pf) => {
                    res.json({ portfolio: pf[0] });
                })
                .catch((err) => {
                    console.log(err);
                    res.status(500).json({ status: "error" });
                });
        })
        .catch(err => {
            console.log(err);
            res.status(500).json({ status: "error" });
        })
});

// 분리하고 싶은데 .. 
router.post("/", verifyToken, findWriter, imageUploader('images/portfolios').array('projectImages'), (req, res) => {
    // "20161184,20150000"
    // ["20161184","20150000"]
    // 팀장 "20161184"
    // 참여한 사람들 ["20161184",'2020202020"]

    let sl = req.body.students.split(',');
    var count = 0;
    sl.forEach((element) => {
        if (element === req.body.teamLeaderCode) {
            count++;
        }
    })
    if (count != 1) res.status(400).json({ status: "none" });

    Student.find({ _id: { $in: sl } }).count()
        .then((count) => {
            if (count == sl.length) {
                Student.findOne({ _id: req.body.teamLeaderCode }, { nick: true })
                    .then((student) => {

                        const pf = new Portfolio({
                            projectTitle: req.body.projectTitle,
                            students: sl,
                            contents: req.body.contents,
                            link: req.body.link,
                            git: req.body.git,
                            projectStartDate: req.body.projectStartDate,
                            projectEndDate: req.body.projectEndDate,
                            projectTeamName: req.body.projectTeamName,
                            leaderNick: student.nick,
                            projectImages: req.files.map((image) => { return image.filename }),
                            view: 0,
                            writer: res.locals.writer,
                            date: formatDateSend(new Date())
                        });

                        pf.save()
                            .then(() => {
                                res.json({ status: "success" });
                            })
                            .catch((err) => {
                                console.log(err);
                                res.status(500).json({ status: "error" });
                            })
                    })

            }
            else res.status(400).json({ status: "none" });
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ status: "error" });
        });
})

router.delete("/:portfolioId", verifyToken, adminConfirmation, (req, res) => {
    Portfolio.findOneAndRemove({ _id: req.params.portfolioId })
        .then((portfolio) => {
            if (portfolio) {
                imagesCleaner("images/portfolios", portfolio.projectImages);
                res.json({ status: "success" });
            }
            else res.status(400).json({ status: "none" });
        })
        .catch((err) => {
            console.log(err);
            res.status(500).json({ status: "error" });
        })
})

module.exports = router;