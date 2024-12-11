const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");

//middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: Stripe } = require("stripe");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qfdpmw3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const usersCollection = client.db("assignment12").collection("users");
    const teacherRequestCollection = client
      .db("assignment12")
      .collection("teacherRequest");
    const classCollection = client.db("assignment12").collection("classes");
    const paymentCollection = client.db("assignment12").collection("payments");
    const assignmentCollection = client
      .db("assignment12")
      .collection("assignments");
    const assignmentSubmissionCollection = client
      .db("assignment12")
      .collection("assignmentSubmission");
    const reviewCollection = client.db("assignment12").collection("reviews");
    const bannerImageCollection = client
      .db("assignment12")
      .collection("bannerImages");

    /****jwt related apis****/
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "10h",
      });
      res.send({ token });
    });
    //middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "not authorized" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized" });
        }
        req.decoded = decoded;
        next();
      });
    };
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      // console.log("verifyAdmin", email, user);
      if (user?.role !== "admin") {
        return res.send({ message: " unauthorized" });
      }
      next();
    };
    const verifyTeacher = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await teacherRequestCollection.findOne(query);
      if (user?.status !== "approved") {
        return res.status(403).send({ message: "unauthorized" });
      }
      next();
    };
    /****user related  apis****/
    app.post("/users", async (req, res) => {
      const user = req.body;

      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: " user is already in the database" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    // const query = {
    //   status: "approved",
    //   title: { $regex: req.query.search, $options: "i" },
    // };
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const query = { name: { $regex: req.query.search, $options: "i" } };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      if (email !== req.decoded.email) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const result = await usersCollection.findOne(query);
      res.send(result);
    });
    app.patch("/userInfo/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const userInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const existingImage = await usersCollection.findOne(query);
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          name: userInfo.name,
          number: userInfo.number,
          image: userInfo.image || existingImage.image,
        },
      };

      const result = await usersCollection.updateOne(
        query,
        updatedDoc,
        options
      );
      res.send(result);
    });
    //student stats
    app.get("/student-home/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "unauthorized" });
      }
      const query = { email: email };
      const enrollmentCount = await paymentCollection.countDocuments(query);
      const feedbackCount = await reviewCollection.countDocuments(query);
      const stats = await paymentCollection
        .aggregate([
          {
            $match: query,
          },
          {
            $lookup: {
              from: "classes",
              localField: "classId",
              foreignField: "_id",
              as: "enrolledClass",
            },
          },
          {
            $unwind: "$enrolledClass",
          },
          {
            $lookup: {
              from: "teacherRequest",
              localField: "enrolledClass.email",
              foreignField: "email",
              as: "teacher",
            },
          },
          {
            $unwind: "$teacher",
          },
          {
            $lookup: {
              from: "assignments",
              localField: "enrolledClass._id",
              foreignField: "classId",
              as: "assignments",
            },
          },
          {
            $lookup: {
              from: "assignmentSubmission",
              localField: "enrolledClass._id",
              foreignField: "classId",
              as: "submissions",
            },
          },
          {
            $addFields: {
              classId: "$enrolledClass._id",
              title: "$enrolledClass.title",
              image: "$enrolledClass.image",
              teacherName: "$teacher.name",
              assignmentCount: {
                $size: "$assignments",
              },
              submissionCount: {
                $size: {
                  $filter: {
                    input: "$submissions",
                    as: "submission",
                    cond: { $eq: ["$$submission.email", email] },
                  },
                },
              },
            },
          },
          {
            $project: {
              _id: 1,
              classId: 1,
              title: 1,
              image: 1,
              teacherName: 1,
              assignmentCount: 1,
              submissionCount: 1,
            },
          },
        ])
        .toArray();

      res.send({ enrollmentCount, feedbackCount, stats });
    });
    /*******teacher related api*******/
    app.post("/teacherRequest", verifyToken, async (req, res) => {
      const request = req.body;
      const email = request.email;
      const filter = { email: email };
      const existingRequest = await teacherRequestCollection.findOne(filter);
      if (existingRequest) {
        const deleteLastRequest = await teacherRequestCollection.deleteOne(
          filter
        );
      }
      const result = await teacherRequestCollection.insertOne(request);
      res.send(result);
    });
    app.get("/teacherRequest", verifyToken, verifyAdmin, async (req, res) => {
      const result = await teacherRequestCollection
        .find()
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });
    app.patch(
      "/teacherRequest/reject/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "rejected",
          },
        };
        const result = await teacherRequestCollection.updateOne(
          query,
          updatedDoc
        );
        res.send(result);
      }
    );
    //set the status to approved
    app.patch(
      "/teacherRequest/approve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await teacherRequestCollection.updateOne(
          query,
          updatedDoc
        );

        res.send(result);
      }
    );

    app.get("/teachersStatus", verifyToken, async (req, res) => {
      const query = { status: "approved" };
      const options = {
        projection: {
          _id: 0,
          email: 1,
          status: 1,
        },
      };
      const result = await teacherRequestCollection
        .find(query, options)
        .toArray();
      res.send(result);
    });
    app.get("/users/teacher/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await teacherRequestCollection.findOne(query);
      if (user) {
        // If the user exists but no status is set, return "pending"
        if (!user.status) {
          return res.send({ status: "pending" });
        }
        // If user exists and status is set, return the actual status
        return res.send({ status: user.status, category: user.category });
      }

      // If no user is found, return "not_found"
      return res.send({ status: "not_found" });
    });

    app.get("/teacher/:email", async (req, res) => {
      const email = req.params.email;
      console.log("teacher", email);
      const query = { email: email };
      const result = await teacherRequestCollection.findOne(query);
      res.send(result);
    });
    app.get("/teachers", async (req, res) => {
      const result = await teacherRequestCollection
        .find({
          status: "approved",
        })
        .toArray();
      res.send(result);
    });
    app.get("/teacherCategory/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const teacher = await teacherRequestCollection.findOne(query);
      console.log("category", teacher.category);
      res.send(teacher.category);
    });
    // teacher stats
    app.get(
      "/teacher-home/:email",
      verifyToken,
      verifyTeacher,
      async (req, res) => {
        const email = req.params.email;
        if (req.decoded.email !== email) {
          return;
        }
        const query = { email: email, status: "approved" };
        const allClass = await classCollection.countDocuments({ email: email });
        const classes = await classCollection.countDocuments(query);
        const students = await classCollection
          .aggregate([
            { $match: query },
            {
              $lookup: {
                from: "payments",
                localField: "_id",
                foreignField: "classId",
                as: "enrollments",
              },
            },
            {
              $unwind: "$enrollments",
            },
            {
              $group: {
                _id: "$enrollments.email",
                totalStudents: {
                  $sum: 1,
                },
              },
            },
          ])
          .toArray();
        const StudentCount = students.length > 0 ? students.length : 0;
        const enrollmetCount = students.reduce(
          (sum, student) => sum + student.totalStudents,
          0
        );
        const classOverview = await classCollection
          .aggregate([
            { $match: query },
            {
              $lookup: {
                from: "payments",
                localField: "_id",
                foreignField: "classId",
                as: "enrollments",
              },
            },
            {
              $lookup: {
                from: "reviews",
                localField: "_id",
                foreignField: "classId",
                as: "reviews",
              },
            },
            {
              $lookup: {
                from: "assignments",
                localField: "_id",
                foreignField: "classId",
                as: "assignments",
              },
            },
            {
              $lookup: {
                from: "assignmentSubmission",
                localField: "_id",
                foreignField: "classId",
                as: "submissions",
              },
            },
            {
              $addFields: {
                enrollmentCount: { $size: "$enrollments" },
                reviewCount: {
                  $size: "$reviews",
                },
                averageRating: {
                  $avg: "$reviews.rating",
                },
                assignmentCount: {
                  $size: "$assignments",
                },
                submissionCount: {
                  $size: "$submissions",
                },
              },
            },
            {
              $project: {
                _id: 1,
                title: 1,
                image: 1,
                enrollmentCount: 1,
                reviewCount: 1,
                averageRating: 1,
                assignmentCount: 1,
                submissionCount: 1,
              },
            },
          ])

          .toArray();

        res.send({
          allClass,
          classes,
          StudentCount,
          enrollmetCount,
          classOverview,
        });
      }
    );

    /*****class related apis******/

    //get top rated classes for featured class
    app.get("/featuredClasses", async (req, res) => {
      const classes = await classCollection
        .aggregate([
          {
            $lookup: {
              from: "reviews",
              localField: "_id",
              foreignField: "classId",
              as: "reviewedClass",
            },
          },
          {
            $unwind: "$reviewedClass",
          },
          {
            $group: {
              _id: "$_id",
              reviewCount: {
                $sum: 1,
              },
              title: { $first: "$title" },
              image: { $first: "$image" },
              price: { $first: "$price" },
              email: { $first: "$email" },
              description: { $first: "$description" },
              averageRating: {
                $avg: "$reviewedClass.rating",
              },
            },
          },
          {
            $lookup: {
              from: "teacherRequest",
              localField: "email",
              foreignField: "email",
              as: "teacher",
            },
          },
          {
            $unwind: "$teacher",
          },
          {
            $sort: { averageRating: -1 },
          },
          {
            $limit: 6,
          },
        ])
        .toArray();
      res.send(classes);
    });

    app.post("/class", verifyToken, verifyTeacher, async (req, res) => {
      const classs = req.body;
      const result = await classCollection.insertOne(classs);
      res.send(result);
    });
    app.get("/allClass", async (req, res) => {
      const result = await classCollection.find().sort({ _id: -1 }).toArray();
      res.send(result);
    });
    app.patch("/class/:id", verifyToken, verifyTeacher, async (req, res) => {
      const id = req.params.id;
      const aClass = req.body;
      const query = { _id: new ObjectId(id) };
      const existingImage = await classCollection.findOne(query);
      const updatedDoc = {
        $set: {
          title: aClass.title,
          price: aClass.price,
          description: aClass.description,
          image: aClass.image || existingImage.image,
        },
      };
      const result = await classCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.get("/class", async (req, res) => {
      const min = parseInt(req.query.min) || 0;
      const max = parseInt(req.query.max) || Infinity;

      const page = req.query.category === "All" ? parseInt(req.query.page) : 0;
      const size =
        req.query.category === "All" ? parseInt(req.query.size) : Infinity;

      const query = {
        status: "approved",
        title: { $regex: req.query.search || "", $options: "i" },
        price: { $lte: max, $gte: min }, //
      };

      if (req.query?.category && req.query.category !== "All") {
        query.category = req.query.category;
      }

      console.log("Query:", query);
      const classCount = await classCollection.countDocuments(query);
      const result = await classCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send({ result, classCount });
    });
    //class by teacher
    app.get("/classByTeacher/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email, status: "approved" };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    app.patch(
      "/class/approve/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "approved",
          },
        };
        const result = await classCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );
    app.patch(
      "/class/reject/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: "rejected",
          },
        };
        const result = await classCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );
    app.get("/classes/:email", verifyToken, verifyTeacher, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthoriized access" });
      }
      const query = { email: email };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/class/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });
    app.delete("/class/:id", verifyToken, verifyTeacher, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.deleteOne(query);
      res.send(result);
    });
    //get enrolled class for specific users
    app.get("/student/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthoriized access" });
      }
      const query = { email: email };
      const options = {
        projection: {
          _id: 0,
          classId: 1,
        },
      };
      const classesId = await paymentCollection.find(query, options).toArray();
      const ids = classesId.map((item) => new ObjectId(item.classId));
      const filter = { _id: { $in: ids } };
      const options2 = {
        projection: {
          name: 1,
          title: 1,
          image: 1,
        },
      };
      const result = await classCollection.find(filter, options2).toArray();
      res.send({ classesId, result });
    });
    /******assignment relared apis******/
    app.post("/assignment", verifyToken, verifyTeacher, async (req, res) => {
      const assignment = req.body;
      assignment.classId = new ObjectId(assignment.classId);
      const result = await assignmentCollection.insertOne(assignment);
      res.send(result);
    });
    app.get("/assignment/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { classId: new ObjectId(id) };
      const result = await assignmentCollection.find(query).toArray();
      res.send(result);
    });
    app.post("/submission", verifyToken, async (req, res) => {
      const assignment = req.body;
      assignment.classId = new ObjectId(assignment.classId);
      const result = await assignmentSubmissionCollection.insertOne(assignment);
      res.send(result);
    });
    app.get("/checkSubmission/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthoriized access" });
      }
      const query = { email: email };
      const options = {
        projection: {
          assignmentId: 1,
        },
      };
      const result = await assignmentSubmissionCollection
        .find(query, options)
        .toArray();
      res.send(result);
    });
    app.get("/checkEnrollment/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email: email };
      const options = {
        projection: {
          classId: 1,
        },
      };
      const result = await paymentCollection.find(query, options).toArray();
      res.send(result);
    });
    /****reviews related apis****/
    app.post("/reviews", verifyToken, async (req, res) => {
      const review = req.body;
      review.classId = new ObjectId(review.classId);
      const result = await reviewCollection.insertOne(review);
      res.send(result);
    });
    app.get("/reviews/:classId", async (req, res) => {
      const classId = req.params.classId;
      const query = { classId: new ObjectId(classId) };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/reviews", async (req, res) => {
      // const reviews = await reviewCollection
      const result = await reviewCollection
        .find()
        .sort({ rating: -1 })
        .limit(10)
        .toArray();
      res.send(result);
    });
    /*counting enrollments,assignments and asignment submissions*/
    app.get(
      "/teacher-stats/:id",
      verifyToken,
      verifyTeacher,

      async (req, res) => {
        const id = req.params.id;
        const query = { classId: new ObjectId(id) };
        const enrollmentCount = await paymentCollection.countDocuments(query);
        console.log("enrollment", enrollmentCount);
        const assignmentCount = await assignmentCollection.countDocuments(
          query
        );
        const assignmentSubmissionCount =
          await assignmentSubmissionCollection.countDocuments(query);
        res.send({
          enrollmentCount,
          assignmentCount,
          assignmentSubmissionCount,
        });
      }
    );

    /****payment related apis****/
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    app.post("/payment", verifyToken, async (req, res) => {
      const payment = req.body;
      payment.classId = new ObjectId(payment.classId);
      const paymentResult = await paymentCollection.insertOne(payment);
      res.send(paymentResult);
    });
    /*****admin related apis****/
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      console.log("isAdmin", admin);
      res.send({ admin });
    });
    app.get("/adminStatus", verifyToken, async (req, res) => {
      const query = { role: "admin" };
      const options = {
        projection: {
          _id: 0,
          email: 1,
          role: 1,
        },
      };
      const result = await usersCollection.find(query, options).toArray();
      res.send(result);
    });
    app.post("/bannerImage", verifyToken, verifyAdmin, async (req, res) => {
      const image = req.body;
      const result = await bannerImageCollection.insertOne(image);
      res.send(result);
    });
    app.get("/bannerImage", async (req, res) => {
      const result = await bannerImageCollection
        .find()
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const usersCount = await usersCollection.estimatedDocumentCount();
      const classesCount = await classCollection.countDocuments({
        status: "approved",
      });
      const teachersCount = await teacherRequestCollection.countDocuments({
        status: "approved",
      });
      const totalEnrollment = await paymentCollection.estimatedDocumentCount();
      const students = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: "$email",
            },
          },
          {
            $count: "totalStudents",
          },
        ])
        .toArray();
      const totalStudents = students[0].totalStudents;
      const revenue = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();

      const totalRevenue = revenue[0]?.totalRevenue || 0;
      //get enrollments and revenue for each category

      const enrollment = await paymentCollection
        .aggregate([
          {
            $lookup: {
              from: "classes",
              localField: "classId",
              foreignField: "_id",
              as: "matchedClass",
            },
          },
          {
            $unwind: "$matchedClass",
          },
          {
            $group: {
              _id: "$matchedClass.category",
              enrollmentCount: { $sum: 1 },
            },
          },
        ])
        .toArray();
      res.send({
        totalRevenue,
        usersCount,
        classesCount,
        teachersCount,
        totalStudents,
        totalEnrollment,
        enrollment,
      });
      console.log("student count", totalRevenue);
    });
    //home page
    app.get("/home-stats", async (req, res) => {
      const userCount = await usersCollection.estimatedDocumentCount();
      const classCount = await classCollection.countDocuments({
        status: "approved",
      });
      const enrollmentCount = await paymentCollection.estimatedDocumentCount();
      res.send({ userCount, classCount, enrollmentCount });
    });
    //categories
    app.get("/categories", async (req, res) => {
      const query = { status: "approved" };
      const developmentClasses = await classCollection.countDocuments({
        ...query,
        category: "Web development",
      });
      const dataScienceClasses = await classCollection.countDocuments({
        ...query,
        category: "Data science",
      });
      const marketingClasses = await classCollection.countDocuments({
        ...query,
        category: "Digital marketing",
      });
      const devopsClasses = await classCollection.countDocuments({
        ...query,
        category: "DevOps",
      });
      const cryptoClasses = await classCollection.countDocuments({
        ...query,
        category: "Crypto",
      });

      const categories = await classCollection
        .aggregate([
          {
            $match: query,
          },
          {
            $lookup: {
              from: "payments",
              localField: "_id",
              foreignField: "classId",
              as: "enrollments",
            },
          },
          {
            $addFields: {
              enrollmentCount: { $size: "$enrollments" },
            },
          },
          {
            $match: {
              enrollmentCount: { $gt: 0 },
            },
          },
          {
            $sort: {
              enrollmentCount: -1,
            },
          },
          {
            $group: {
              _id: "$category",
              classes: {
                $push: {
                  _id: "$_id",
                  title: "$title",
                  price: "$price",
                  image: "$image",
                  enrollmentCount: "$enrollmentCount",
                },
              },
            },
          },
          {
            $addFields: {
              classes: {
                $slice: ["$classes", 3],
              },
            },
          },
        ])
        .toArray();

      res.send({
        categories,
        developmentClasses,
        dataScienceClasses,
        cryptoClasses,
        devopsClasses,
        marketingClasses,
      });
    });
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Developers");
});

app.listen(port);
