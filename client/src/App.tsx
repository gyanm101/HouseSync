import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

type Household = {
  id: number;
  name: string;
  created_at: string;
};

function App() {

    const [households, setHouseholds] = useState<Household[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [userInput, setUserInput] = useState('');
    const [createError, setCreateError] = useState('');

    useEffect(() => {
    fetch('http://localhost:3000/households')
        .then(response => {
            if(!response.ok){
                throw new Error("Request failed");
            }
            return response.json();
            })
        .then(data => setHouseholds(data))
        .catch(error => setLoadError(error.message))
        .finally(() => setLoading(false));
    }, []);

    function handleSubmit(event: FormEvent<HTMLFormElement>){
        event.preventDefault();
        setCreateError('');

        if(!userInput.trim()){
            console.log('Household name is required');
            return;
        }

        fetch('http://localhost:3000/households', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                name: userInput.trim()
              })
            }).then(response => {
                if(!response.ok){
                    throw new Error('Request Failed');
                }
                return response.json();
            }).then(data => {
                setHouseholds(households => [
                    ...households,
                    data
                ]);
                setUserInput('');
            }).catch(error => setCreateError(error.message))
        }




    return (
    <>
      <h1>HouseSync</h1>
      <p>Frontend is running</p>
      {loading ? (
        <p> Loading </p>
      ) : loadError ? (
          <p> {loadError} </p>
      ) : (
          households.map(household => (
              <p key={household.id}>{household.name}</p>
          ))
      )}

        <form onSubmit={handleSubmit}>
          <input
            value={userInput}
            onChange={event => setUserInput(event.target.value)}
          />
          <button type="submit">Add</button>
        </form>

        {createError && (
            <p>{createError}</p>
            )
        }

    </>
    )
}

export default App
