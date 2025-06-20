/* eslint-disable camelcase */
'use client';

// Importing React hooks and Next.js router for navigation
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Importing custom UI components
import HomeCard from './HomeCard';
import MeetingModal from './MeetingModal';
import { Call, useStreamVideoClient } from '@stream-io/video-react-sdk';
import { useUser } from '@clerk/nextjs';
import Loader from './Loader';
import { Textarea } from './ui/textarea';
import ReactDatePicker from 'react-datepicker';
import { useToast } from './ui/use-toast';
import { Input } from './ui/input';

// Initial values for scheduling a meeting
const initialValues = {
  dateTime: new Date(), // Default to current date/time
  description: '',      // Meeting description
  link: '',             // Meeting link for joining
};

const MeetingTypeList = () => {
  const router = useRouter(); // For navigation
  // State to track which modal is open (schedule, join, instant)
  const [meetingState, setMeetingState] = useState<
    'isScheduleMeeting' | 'isJoiningMeeting' | 'isInstantMeeting' | undefined
  >(undefined);
  // State for form values (date, description, link)
  const [values, setValues] = useState(initialValues);
  // State to store call details after creating a meeting
  const [callDetail, setCallDetail] = useState<Call>();
  // Stream Video client for video call operations
  const client = useStreamVideoClient();
  // Clerk user object for authentication
  const { user } = useUser();
  // Toast for showing notifications
  const { toast } = useToast();

  // Function to create a new meeting (instant or scheduled)
  const createMeeting = async () => {
    if (!client || !user) return; // Ensure client and user are available
    try {
      if (!values.dateTime) {
        toast({ title: 'Please select a date and time' });
        return;
      }
      // Generate a unique meeting ID
      const id = crypto.randomUUID();
      // Create a new call object
      const call = client.call('default', id);
      if (!call) throw new Error('Failed to create meeting');
      // Set meeting start time and description
      const startsAt =
        values.dateTime.toISOString() || new Date(Date.now()).toISOString();
      const description = values.description || 'Instant Meeting';
      // Create or get the call on the server
      await call.getOrCreate({
        data: {
          starts_at: startsAt,
          custom: {
            description,
          },
        },
      });
      setCallDetail(call); // Save call details in state
      // If it's an instant meeting, redirect to the meeting page
      if (!values.description) {
        router.push(`/meeting/${call.id}`);
      }
      toast({
        title: 'Meeting Created',
      });
    } catch (error) {
      console.error(error);
      toast({ title: 'Failed to create Meeting' });
    }
  };

  // Show loader while client or user is loading
  if (!client || !user) return <Loader />;

  // Generate the meeting link to share
  const meetingLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${callDetail?.id}`;

  return (
    // Main section with meeting option cards
    <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
      {/* Card for starting a new instant meeting */}
      <HomeCard
        img="/icons/add-meeting.svg"
        title="New Meeting"
        description="Start an instant meeting"
        handleClick={() => setMeetingState('isInstantMeeting')}
      />
      {/* Card for joining a meeting via link */}
      <HomeCard
        img="/icons/join-meeting.svg"
        title="Join Meeting"
        description="via invitation link"
        className="bg-blue-1"
        handleClick={() => setMeetingState('isJoiningMeeting')}
      />
      {/* Card for scheduling a meeting in the future */}
      <HomeCard
        img="/icons/schedule.svg"
        title="Schedule Meeting"
        description="Plan your meeting"
        className="bg-purple-1"
        handleClick={() => setMeetingState('isScheduleMeeting')}
      />
      {/* Card for viewing past meeting recordings */}
      <HomeCard
        img="/icons/recordings.svg"
        title="View Recordings"
        description="Meeting Recordings"
        className="bg-yellow-1"
        handleClick={() => router.push('/recordings')}
      />

      {/* Modal for scheduling a meeting (shows form) */}
      {!callDetail ? (
        <MeetingModal
          isOpen={meetingState === 'isScheduleMeeting'}
          onClose={() => setMeetingState(undefined)}
          title="Create Meeting"
          handleClick={createMeeting}
        >
          {/* Description input */}
          <div className="flex flex-col gap-2.5">
            <label className="text-base font-normal leading-[22.4px] text-sky-2">
              Add a description
            </label>
            <Textarea
              className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0"
              onChange={(e) =>
                setValues({ ...values, description: e.target.value })
              }
            />
          </div>
          {/* Date and time picker */}
          <div className="flex w-full flex-col gap-2.5">
            <label className="text-base font-normal leading-[22.4px] text-sky-2">
              Select Date and Time
            </label>
            <ReactDatePicker
              selected={values.dateTime}
              onChange={(date) => setValues({ ...values, dateTime: date! })}
              showTimeSelect
              timeFormat="HH:mm"
              timeIntervals={15}
              timeCaption="time"
              dateFormat="MMMM d, yyyy h:mm aa"
              className="w-full rounded bg-dark-3 p-2 focus:outline-none"
            />
          </div>
        </MeetingModal>
      ) : (
        // Modal shown after meeting is created, allows copying the meeting link
        <MeetingModal
          isOpen={meetingState === 'isScheduleMeeting'}
          onClose={() => setMeetingState(undefined)}
          title="Meeting Created"
          handleClick={() => {
            navigator.clipboard.writeText(meetingLink);
            toast({ title: 'Link Copied' });
          }}
          image={'/icons/checked.svg'}
          buttonIcon="/icons/copy.svg"
          className="text-center"
          buttonText="Copy Meeting Link"
        />
      )}

      {/* Modal for joining a meeting by entering a link */}
      <MeetingModal
        isOpen={meetingState === 'isJoiningMeeting'}
        onClose={() => setMeetingState(undefined)}
        title="Type the link here"
        className="text-center"
        buttonText="Join Meeting"
        handleClick={() => router.push(values.link)}
      >
        <Input
          placeholder="Meeting link"
          onChange={(e) => setValues({ ...values, link: e.target.value })}
          className="border-none bg-dark-3 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </MeetingModal>

      {/* Modal for starting an instant meeting */}
      <MeetingModal
        isOpen={meetingState === 'isInstantMeeting'}
        onClose={() => setMeetingState(undefined)}
        title="Start an Instant Meeting"
        className="text-center"
        buttonText="Start Meeting"
        handleClick={createMeeting}
      />
    </section>
  );
};

export default MeetingTypeList;
